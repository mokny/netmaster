import { prisma } from "@/lib/prisma";
import {
  METRICS_COMMAND,
  DOCKER_COMMAND,
  DOCKER_IMAGES_COMMAND,
  PROXMOX_COMMAND,
  buildDockerInspectIpsCommand,
  buildVmIpCommand,
  execOnServer,
} from "@/lib/ssh";
import { execPooled, invalidatePooledConnection } from "@/lib/ssh-pool";
import {
  parseMetricsOutput,
  parseDockerOutput,
  parseDockerImagesOutput,
  parseProxmoxOutput,
  parseDockerInspectIps,
  parseQemuAgentIps,
  parseIpAddrShowIps,
} from "./parse";
import { getCachedIps, dockerIpKey, vmIpKey, refreshIfStale } from "./ip-cache";
import { computeServerStatus, type MetricKey, type StatusValue } from "./status";
import { publish } from "./events";
import { notifyServerEvent, notifyServerRecovery, sendPushToUser, type NotificationEvent } from "@/lib/push";
import { shouldFireDelayedAlert, shouldFireRecovery } from "./alert-delay";
import { runPingCheck } from "@/lib/ping";
import { logPoll, POLL_LOG_RETENTION_MS } from "./poll-log";
import type { Server as ServerModel, ServiceCheck } from "@/generated/prisma/client";

// Rate = Delta der kumulativen Byte-Zähler / Delta der Zeit zum letzten Poll,
// umgerechnet in Mbit/s. Kein vorheriger Sample oder ein negatives Delta
// (Zähler-Reset, z.B. Reboot) liefert null statt eines falschen Ausreißers.
function bytesPerSecToMbit(bytesPerSec: number) {
  return (bytesPerSec * 8) / 1_000_000;
}

async function computeNetRates(
  serverId: string,
  now: Date,
  rxBytes: number | null,
  txBytes: number | null
) {
  const prev = await prisma.metricSample.findFirst({
    where: { serverId },
    orderBy: { timestamp: "desc" },
    select: { timestamp: true, netRxBytes: true, netTxBytes: true },
  });

  const rateFor = (curr: number | null, prevVal: number | null | undefined, deltaSec: number) => {
    if (curr === null || prevVal === null || prevVal === undefined || deltaSec <= 0) return null;
    const delta = curr - prevVal;
    if (delta < 0) return null;
    return bytesPerSecToMbit(delta / deltaSec);
  };

  const deltaSec = prev ? (now.getTime() - prev.timestamp.getTime()) / 1000 : 0;
  return {
    downloadMbit: rateFor(rxBytes, prev?.netRxBytes, deltaSec),
    uploadMbit: rateFor(txBytes, prev?.netTxBytes, deltaSec),
  };
}

export async function collectServerMetrics(server: ServerModel) {
  try {
    const { stdout } = await execPooled(server, METRICS_COMMAND);
    const metrics = parseMetricsOutput(stdout);
    const now = new Date();
    const netRates = await computeNetRates(server.id, now, metrics.netRxBytes, metrics.netTxBytes);
    const result = computeServerStatus(server, metrics, netRates);
    const status = result.overall;

    const sample = await prisma.metricSample.create({
      data: {
        serverId: server.id,
        cpuPercent: metrics.cpuPercent,
        memPercent: metrics.memPercent,
        diskPercent: metrics.diskPercent,
        loadAvg1: metrics.loadAvg1,
        loadAvg5: metrics.loadAvg5,
        loadAvg15: metrics.loadAvg15,
        netRxBytes: metrics.netRxBytes,
        netTxBytes: metrics.netTxBytes,
      },
    });

    const sinceUpdates = computeMetricSinceUpdates(server, result.metrics, now);
    const wasOffline = Boolean(server.lastError);
    const offlineSinceBeforeClear = server.offlineSince;

    // Statische Host-Eigenschaften nur überschreiben, wenn dieser Poll sie
    // liefern konnte - ein einzelner Parse-Aussetzer soll nicht den zuletzt
    // bekannten Wert löschen.
    await prisma.server.update({
      where: { id: server.id },
      data: {
        lastStatus: status,
        lastError: null,
        lastCheckedAt: new Date(),
        lastCpuStatus: result.metrics.cpu,
        lastMemStatus: result.metrics.mem,
        lastDiskStatus: result.metrics.disk,
        lastNetStatus: result.metrics.net,
        offlineSince: null,
        ...sinceUpdates.dbFields,
        ...(metrics.cpuCores !== null && { cpuCores: metrics.cpuCores }),
        ...(metrics.memTotalMb !== null && { memTotalMb: metrics.memTotalMb }),
        ...(metrics.osName !== null && { osName: metrics.osName }),
        ...(metrics.kernelVersion !== null && { kernelVersion: metrics.kernelVersion }),
        ...(metrics.uptimeSeconds !== null && {
          bootedAt: new Date(Date.now() - metrics.uptimeSeconds * 1000),
        }),
      },
    });

    if (wasOffline) {
      void notifyServerRecovery(
        server.id,
        "offlineEnabled",
        {
          key: "serverOfflineRecovered",
          params: { serverName: server.name },
          url: `/servers/${server.id}`,
        },
        offlineSinceBeforeClear
      );
    }

    if (metrics.disks.length > 0) {
      await prisma.diskSample.createMany({
        data: metrics.disks.map((d) => ({
          serverId: server.id,
          timestamp: sample.timestamp,
          mountpoint: d.mountpoint,
          device: d.device,
          totalKb: d.totalKb,
          usedKb: d.usedKb,
          percent: d.percent,
        })),
      });
    }

    publish({
      type: "metric",
      serverId: server.id,
      sample: {
        id: sample.id,
        timestamp: sample.timestamp,
        cpuPercent: sample.cpuPercent,
        memPercent: sample.memPercent,
        diskPercent: sample.diskPercent,
        loadAvg1: sample.loadAvg1,
        loadAvg5: sample.loadAvg5,
        loadAvg15: sample.loadAvg15,
        netRxBytes: sample.netRxBytes,
        netTxBytes: sample.netTxBytes,
      },
      disks: metrics.disks.map((d) => ({
        timestamp: sample.timestamp,
        mountpoint: d.mountpoint,
        device: d.device,
        totalKb: d.totalKb,
        usedKb: d.usedKb,
        percent: d.percent,
      })),
    });
    publish({ type: "server-status", serverId: server.id, status });
    void notifyMetricAlerts(server, result.metrics, sinceUpdates);

    const cutoff = new Date(
      Date.now() - server.retentionDays * 24 * 60 * 60 * 1000
    );
    await prisma.metricSample.deleteMany({
      where: { serverId: server.id, timestamp: { lt: cutoff } },
    });
    await prisma.diskSample.deleteMany({
      where: { serverId: server.id, timestamp: { lt: cutoff } },
    });
    await prisma.pollLog.deleteMany({
      where: { serverId: server.id, timestamp: { lt: new Date(Date.now() - POLL_LOG_RETENTION_MS) } },
    });
    logPoll(server.id, "host_metrics", true);
  } catch (err) {
    invalidatePooledConnection(server.id);
    const message = err instanceof Error ? err.message : "Unknown error";
    const offlineSince = server.offlineSince ?? new Date();
    await prisma.server.update({
      where: { id: server.id },
      data: {
        lastStatus: "CRITICAL",
        lastError: message,
        lastCheckedAt: new Date(),
        offlineSince,
      },
    });
    publish({
      type: "server-status",
      serverId: server.id,
      status: "CRITICAL",
      error: message,
    });
    void notifyServerEvent(
      server.id,
      "offlineEnabled",
      {
        key: "serverOffline",
        params: { serverName: server.name, detail: message },
        url: `/servers/${server.id}`,
      },
      offlineSince,
      server.pollIntervalSec
    );
    logPoll(server.id, "host_metrics", false);
  }
}

const METRIC_PREV_FIELD: Record<MetricKey, "lastCpuStatus" | "lastMemStatus" | "lastDiskStatus" | "lastNetStatus"> = {
  cpu: "lastCpuStatus",
  mem: "lastMemStatus",
  disk: "lastDiskStatus",
  net: "lastNetStatus",
};

const METRIC_SINCE_FIELDS: Record<
  MetricKey,
  { warn: "cpuWarnSince" | "memWarnSince" | "diskWarnSince" | "netWarnSince"; crit: "cpuCritSince" | "memCritSince" | "diskCritSince" | "netCritSince" }
> = {
  cpu: { warn: "cpuWarnSince", crit: "cpuCritSince" },
  mem: { warn: "memWarnSince", crit: "memCritSince" },
  disk: { warn: "diskWarnSince", crit: "diskCritSince" },
  net: { warn: "netWarnSince", crit: "netCritSince" },
};

const METRIC_EVENTS: Record<MetricKey, { warn: NotificationEvent; crit: NotificationEvent }> = {
  cpu: { warn: "cpuWarnEnabled", crit: "cpuCritEnabled" },
  mem: { warn: "memWarnEnabled", crit: "memCritEnabled" },
  disk: { warn: "diskWarnEnabled", crit: "diskCritEnabled" },
  net: { warn: "netWarnEnabled", crit: "netCritEnabled" },
};

interface MetricSinceUpdate {
  warnSince: Date | null;
  critSince: Date | null;
  recovery: { event: NotificationEvent; since: Date | null } | null;
}

// Berechnet für jede Metrik die neuen "seit wann"-Zeitstempel (Basis für die
// Verzögerung, siehe alert-delay.ts) sowie ob bei diesem Poll eine Recovery
// fällig sein könnte (nur beim Übergang zurück nach OK). Läuft synchron vor
// dem Server.update, damit die *Since-Felder in derselben Schreiboperation
// landen wie lastStatus.
interface MetricSinceComputation {
  dbFields: Partial<
    Record<
      | "cpuWarnSince"
      | "cpuCritSince"
      | "memWarnSince"
      | "memCritSince"
      | "diskWarnSince"
      | "diskCritSince"
      | "netWarnSince"
      | "netCritSince",
      Date | null
    >
  >;
  perMetric: Record<MetricKey, MetricSinceUpdate>;
}

function computeMetricSinceUpdates(
  server: ServerModel,
  newStatuses: Record<MetricKey, StatusValue>,
  now: Date
): MetricSinceComputation {
  const dbFields: MetricSinceComputation["dbFields"] = {};
  const perMetric = {} as Record<MetricKey, MetricSinceUpdate>;
  for (const key of Object.keys(newStatuses) as MetricKey[]) {
    const oldStatus = server[METRIC_PREV_FIELD[key]] as StatusValue;
    const newStatus = newStatuses[key];
    const fields = METRIC_SINCE_FIELDS[key];
    const events = METRIC_EVENTS[key];
    const oldWarnSince = server[fields.warn] as Date | null;
    const oldCritSince = server[fields.crit] as Date | null;

    let warnSince: Date | null = null;
    let critSince: Date | null = null;
    let recovery: MetricSinceUpdate["recovery"] = null;

    if (newStatus === "CRITICAL") {
      critSince = oldCritSince ?? now;
    } else if (newStatus === "WARNING") {
      warnSince = oldWarnSince ?? now;
    } else if (newStatus === "OK" && (oldStatus === "WARNING" || oldStatus === "CRITICAL")) {
      recovery = {
        event: oldStatus === "CRITICAL" ? events.crit : events.warn,
        since: oldStatus === "CRITICAL" ? oldCritSince : oldWarnSince,
      };
    }

    dbFields[fields.warn] = warnSince;
    dbFields[fields.crit] = critSince;
    perMetric[key] = { warnSince, critSince, recovery };
  }
  return { dbFields, perMetric };
}

// Löst (verzögerte) Push-Benachrichtigungen pro Einzelmetrik aus - läuft bei
// jedem Poll, nicht nur beim Statuswechsel, damit die Verzögerung (siehe
// alert-delay.ts) je User geprüft werden kann, solange der Zustand anhält.
// Recovery-Nachrichten feuern dagegen nur exakt auf dem Übergangs-Poll nach OK.
async function notifyMetricAlerts(
  server: ServerModel,
  newStatuses: Record<MetricKey, StatusValue>,
  sinceUpdates: MetricSinceComputation
) {
  for (const key of Object.keys(newStatuses) as MetricKey[]) {
    const events = METRIC_EVENTS[key];
    const { warnSince, critSince, recovery } = sinceUpdates.perMetric[key];

    if (critSince) {
      void notifyServerEvent(
        server.id,
        events.crit,
        {
          key: "metricCritical",
          params: { serverName: server.name, metric: key },
          url: `/servers/${server.id}`,
        },
        critSince,
        server.pollIntervalSec
      );
    } else if (warnSince) {
      void notifyServerEvent(
        server.id,
        events.warn,
        {
          key: "metricWarning",
          params: { serverName: server.name, metric: key },
          url: `/servers/${server.id}`,
        },
        warnSince,
        server.pollIntervalSec
      );
    } else if (recovery) {
      void notifyServerRecovery(
        server.id,
        recovery.event,
        {
          key: "metricRecovered",
          params: { serverName: server.name, metric: key },
          url: `/servers/${server.id}`,
        },
        recovery.since
      );
    }
  }
}

// Nur bei Bedarf (Cache abgelaufen) im Hintergrund angestoßen - siehe
// ip-cache.ts. Läuft parallel zum eigentlichen Poll, verzögert ihn also nicht.
// force=true erzwingt den Refresh (manueller "IP aktualisieren"-Button).
export function refreshDockerIp(server: ServerModel, containerId: string, force = false) {
  return refreshIfStale(
    dockerIpKey(server.id, containerId),
    async () => {
      const { stdout } = await execPooled(server, buildDockerInspectIpsCommand(containerId));
      const ips = parseDockerInspectIps(stdout);
      await prisma.dockerContainerState
        .updateMany({
          where: { serverId: server.id, containerId },
          data: { ipsJson: JSON.stringify(ips) },
        })
        .catch(() => {});
      return ips;
    },
    force
  );
}

export function refreshVmIp(server: ServerModel, type: "qemu" | "lxc", vmid: number, force = false) {
  return refreshIfStale(
    vmIpKey(server.id, vmid),
    async () => {
      const { command, stdin } = buildVmIpCommand(server, type, vmid);
      const { stdout } = await execOnServer(server, command, 10_000, stdin);
      const ips = type === "qemu" ? parseQemuAgentIps(stdout) : parseIpAddrShowIps(stdout);
      await prisma.proxmoxVm
        .updateMany({
          where: { serverId: server.id, vmid },
          data: { ipsJson: JSON.stringify(ips) },
        })
        .catch(() => {});
      return ips;
    },
    force
  );
}

export async function collectDockerContainers(
  server: ServerModel,
  trigger: "scheduled" | "on_demand" = "scheduled"
) {
  if (!server.dockerEnabled) return;
  const pollType = trigger === "on_demand" ? "on_demand" : "docker_containers";
  try {
    const { stdout } = await execPooled(server, DOCKER_COMMAND);
    const containers = parseDockerOutput(stdout);
    const now = new Date();

    if (containers.length > 0) {
      await prisma.dockerContainerSnapshot.createMany({
        data: containers.map((c) => ({
          serverId: server.id,
          containerId: c.containerId,
          name: c.name,
          image: c.image,
          state: c.state,
          cpuPercent: c.cpuPercent,
          memUsageMb: c.memUsageMb,
          netRxMb: c.netRxMb,
          netTxMb: c.netTxMb,
        })),
      });
    }

    const previousStates = await prisma.dockerContainerState.findMany({
      where: { serverId: server.id },
    });
    const prevByContainer = new Map(previousStates.map((s) => [s.containerId, s]));
    const seenContainerIds = new Set(containers.map((c) => c.containerId));

    for (const c of containers) {
      const isRunning = c.state.toLowerCase() === "running";
      const prev = prevByContainer.get(c.containerId);

      if (!prev) {
        await prisma.dockerContainerState.create({
          data: {
            serverId: server.id,
            containerId: c.containerId,
            name: c.name,
            running: isRunning,
            stoppedSince: isRunning ? null : now,
          },
        });
        continue;
      }

      if (prev.running && !isRunning) {
        const stoppedSince = now;
        await prisma.dockerContainerState.update({
          where: { id: prev.id },
          data: { running: false, name: c.name, stoppedSince },
        });
        void notifyServerEvent(
          server.id,
          "dockerStoppedEnabled",
          {
            key: "dockerContainerStopped",
            params: { serverName: server.name, containerName: c.name, state: c.state },
            url: `/servers/${server.id}`,
          },
          stoppedSince,
          server.pollIntervalSec
        );
      } else if (!prev.running && !isRunning) {
        await prisma.dockerContainerState.update({
          where: { id: prev.id },
          data: { name: c.name },
        });
        void notifyServerEvent(
          server.id,
          "dockerStoppedEnabled",
          {
            key: "dockerContainerStopped",
            params: { serverName: server.name, containerName: c.name, state: c.state },
            url: `/servers/${server.id}`,
          },
          prev.stoppedSince,
          server.pollIntervalSec
        );
      } else if (!prev.running && isRunning) {
        await prisma.dockerContainerState.update({
          where: { id: prev.id },
          data: { running: true, name: c.name, stoppedSince: null },
        });
        void notifyServerRecovery(
          server.id,
          "dockerStoppedEnabled",
          {
            key: "dockerContainerRecovered",
            params: { serverName: server.name, containerName: c.name },
            url: `/servers/${server.id}`,
          },
          prev.stoppedSince
        );
      } else if (prev.name !== c.name) {
        await prisma.dockerContainerState.update({
          where: { id: prev.id },
          data: { name: c.name },
        });
      }
    }

    const staleIds = previousStates
      .filter((s) => !seenContainerIds.has(s.containerId))
      .map((s) => s.id);
    if (staleIds.length > 0) {
      await prisma.dockerContainerState.deleteMany({ where: { id: { in: staleIds } } });
    }

    for (const c of containers) {
      if (c.state.toLowerCase() === "running") refreshDockerIp(server, c.containerId);
    }
    const containersWithIps = containers.map((c) => ({
      ...c,
      ips: getCachedIps(dockerIpKey(server.id, c.containerId)) ?? [],
    }));
    publish({ type: "docker", serverId: server.id, containers: containersWithIps });

    // Nur die letzte Momentaufnahme pro Server behalten, um die DB schlank zu halten.
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.dockerContainerSnapshot.deleteMany({
      where: { serverId: server.id, timestamp: { lt: cutoff } },
    });
    logPoll(server.id, pollType, true);
  } catch {
    // Server hat evtl. kein Docker installiert – kein harter Fehler.
    logPoll(server.id, pollType, false);
  }
}

export async function collectDockerImages(server: ServerModel) {
  if (!server.dockerEnabled) return;
  try {
    const { stdout } = await execPooled(server, DOCKER_IMAGES_COMMAND);
    const images = parseDockerImagesOutput(stdout);

    if (images.length > 0) {
      await prisma.dockerImageSnapshot.createMany({
        data: images.map((img) => ({
          serverId: server.id,
          imageId: img.imageId,
          repository: img.repository,
          tag: img.tag,
          sizeMb: img.sizeMb,
          createdLabel: img.createdLabel,
        })),
      });
    }

    publish({ type: "docker-images", serverId: server.id, images });

    // Nur die letzte Momentaufnahme pro Server behalten, um die DB schlank zu halten.
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.dockerImageSnapshot.deleteMany({
      where: { serverId: server.id, timestamp: { lt: cutoff } },
    });
    logPoll(server.id, "docker_images", true);
  } catch {
    // Server hat evtl. kein Docker installiert – kein harter Fehler.
    logPoll(server.id, "docker_images", false);
  }
}

export async function collectProxmoxVms(
  server: ServerModel,
  trigger: "scheduled" | "on_demand" = "scheduled"
) {
  if (!server.proxmoxEnabled) return;
  const pollType = trigger === "on_demand" ? "on_demand" : "proxmox_vms";
  try {
    const { stdout } = await execPooled(server, PROXMOX_COMMAND);
    const vms = parseProxmoxOutput(stdout);

    const cutoff = new Date(
      Date.now() - server.retentionDays * 24 * 60 * 60 * 1000
    );

    const dtos: Record<string, unknown>[] = [];
    for (const v of vms) {
      const record = await prisma.proxmoxVm.upsert({
        where: { serverId_vmid: { serverId: server.id, vmid: v.vmid } },
        create: {
          serverId: server.id,
          vmid: v.vmid,
          type: v.type === "qemu" ? "QEMU" : "LXC",
          name: v.name,
          status: v.status,
          cpuPercent: v.cpuPercent,
          memUsedMb: v.memUsedMb,
          memTotalMb: v.memTotalMb,
          diskUsedGb: v.diskUsedGb,
          diskTotalGb: v.diskTotalGb,
        },
        update: {
          type: v.type === "qemu" ? "QEMU" : "LXC",
          name: v.name,
          status: v.status,
          cpuPercent: v.cpuPercent,
          memUsedMb: v.memUsedMb,
          memTotalMb: v.memTotalMb,
          diskUsedGb: v.diskUsedGb,
          diskTotalGb: v.diskTotalGb,
        },
      });

      const memPercent =
        v.memUsedMb !== null && v.memTotalMb ? (v.memUsedMb / v.memTotalMb) * 100 : null;
      const diskPercent =
        v.diskUsedGb !== null && v.diskTotalGb ? (v.diskUsedGb / v.diskTotalGb) * 100 : null;

      const sample = await prisma.proxmoxVmSample.create({
        data: {
          vmId: record.id,
          cpuPercent: v.cpuPercent,
          memPercent,
          diskPercent,
        },
      });
      await prisma.proxmoxVmSample.deleteMany({
        where: { vmId: record.id, timestamp: { lt: cutoff } },
      });

      if (v.status === "running") refreshVmIp(server, v.type, v.vmid);

      dtos.push({
        id: record.id,
        serverId: server.id,
        vmid: v.vmid,
        type: v.type === "qemu" ? "QEMU" : "LXC",
        name: v.name,
        status: v.status,
        cpuPercent: v.cpuPercent,
        memUsedMb: v.memUsedMb,
        memTotalMb: v.memTotalMb,
        diskUsedGb: v.diskUsedGb,
        diskTotalGb: v.diskTotalGb,
        ips: getCachedIps(vmIpKey(server.id, v.vmid)) ?? [],
        sample: {
          timestamp: sample.timestamp,
          cpuPercent: sample.cpuPercent,
          memPercent: sample.memPercent,
          diskPercent: sample.diskPercent,
        },
      });
    }

    // VMs, die nicht mehr in der aktuellen Liste auftauchen (gelöscht), entfernen.
    const currentVmids = vms.map((v) => v.vmid);
    await prisma.proxmoxVm.deleteMany({
      where: {
        serverId: server.id,
        ...(currentVmids.length > 0 ? { vmid: { notIn: currentVmids } } : {}),
      },
    });

    publish({ type: "proxmox", serverId: server.id, vms: dtos });
    logPoll(server.id, pollType, true);
  } catch {
    // Server hat evtl. kein Proxmox installiert – kein harter Fehler.
    logPoll(server.id, pollType, false);
  }
}

function computeCheckStatus(
  check: ServiceCheck,
  success: boolean,
  latencyMs: number | null
): StatusValue {
  if (!success) return "CRITICAL";
  if (check.latencyWarnMs != null && latencyMs != null && latencyMs > check.latencyWarnMs) {
    return "WARNING";
  }
  return "OK";
}

interface CheckSinceUpdate {
  downSince: Date | null;
  slowSince: Date | null;
  recovery: { which: "down" | "slow"; since: Date | null } | null;
}

function computeCheckSinceUpdate(check: ServiceCheck, newStatus: StatusValue, now: Date): CheckSinceUpdate {
  if (newStatus === "CRITICAL") {
    return { downSince: check.downSince ?? now, slowSince: null, recovery: null };
  }
  if (newStatus === "WARNING") {
    return { downSince: null, slowSince: check.slowSince ?? now, recovery: null };
  }
  if (check.downSince) {
    return { downSince: null, slowSince: null, recovery: { which: "down", since: check.downSince } };
  }
  if (check.slowSince) {
    return { downSince: null, slowSince: null, recovery: { which: "slow", since: check.slowSince } };
  }
  return { downSince: null, slowSince: null, recovery: null };
}

// Benachrichtigt die (opt-in) Abonnenten eines Checks - egal ob frei stehend
// oder servergebunden. Verzögerung und Recovery sind je Abonnent eigen
// konfigurierbar (ServiceCheckSubscriber.down*/slow*), siehe alert-delay.ts.
async function notifyServiceCheckAlerts(check: ServiceCheck, since: CheckSinceUpdate) {
  if (!since.downSince && !since.slowSince && !since.recovery) return;
  const subscribers = await prisma.serviceCheckSubscriber.findMany({
    where: { serviceCheckId: check.id },
  });
  if (subscribers.length === 0) return;

  const url = "/upchecker";

  await Promise.all(
    subscribers.map((s) => {
      if (since.downSince) {
        if (!s.downEnabled) return Promise.resolve();
        if (!shouldFireDelayedAlert(since.downSince, s.downDelayMin, check.intervalSec)) return Promise.resolve();
        return sendPushToUser(s.userId, {
          key: "checkDown",
          params: { checkName: check.name, checkUrl: check.url, detail: check.lastError ?? undefined },
          url,
        });
      }
      if (since.slowSince) {
        if (!s.slowEnabled) return Promise.resolve();
        if (!shouldFireDelayedAlert(since.slowSince, s.slowDelayMin, check.intervalSec)) return Promise.resolve();
        return sendPushToUser(s.userId, {
          key: "checkSlow",
          params: { checkName: check.name, latencyMs: check.latencyWarnMs ?? 0 },
          url,
        });
      }
      if (since.recovery) {
        const { which, since: recSince } = since.recovery;
        if (which === "down") {
          if (!s.downRecoveryEnabled || !shouldFireRecovery(recSince, s.downDelayMin)) return Promise.resolve();
          return sendPushToUser(s.userId, {
            key: "checkRecovered",
            params: { checkName: check.name, checkUrl: check.url },
            url,
          });
        }
        if (!s.slowRecoveryEnabled || !shouldFireRecovery(recSince, s.slowDelayMin)) return Promise.resolve();
        return sendPushToUser(s.userId, {
          key: "checkFastAgain",
          params: { checkName: check.name },
          url,
        });
      }
      return Promise.resolve();
    })
  );
}

export async function runServiceCheck(check: ServiceCheck) {
  const now = new Date();

  if (check.checkType === "PING") {
    const result = await runPingCheck(check.url, check.timeoutMs);
    await prisma.serviceCheckResult.create({
      data: {
        serviceCheckId: check.id,
        success: result.success,
        statusCode: null,
        latencyMs: result.latencyMs,
      },
    });

    const status = computeCheckStatus(check, result.success, result.latencyMs);
    const since = computeCheckSinceUpdate(check, status, now);
    const updated = await prisma.serviceCheck.update({
      where: { id: check.id },
      data: {
        lastStatus: status,
        lastLatencyMs: result.latencyMs,
        lastCheckedAt: now,
        lastError: result.success ? null : result.error || "Host nicht erreichbar",
        downSince: since.downSince,
        slowSince: since.slowSince,
      },
    });

    publish({ type: "service-check", serviceCheckId: check.id, serverId: check.serverId, status });
    void notifyServiceCheckAlerts(updated, since);
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), check.timeoutMs);

  try {
    const res = await fetch(check.url, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
    });
    const latencyMs = Date.now() - now.getTime();
    const success = res.status === check.expectedStatus;

    await prisma.serviceCheckResult.create({
      data: {
        serviceCheckId: check.id,
        success,
        statusCode: res.status,
        latencyMs,
      },
    });

    const status = computeCheckStatus(check, success, latencyMs);
    const since = computeCheckSinceUpdate(check, status, now);
    const updated = await prisma.serviceCheck.update({
      where: { id: check.id },
      data: {
        lastStatus: status,
        lastLatencyMs: latencyMs,
        lastCheckedAt: now,
        lastError: success ? null : `Unerwarteter Status-Code: ${res.status}`,
        downSince: since.downSince,
        slowSince: since.slowSince,
      },
    });

    publish({
      type: "service-check",
      serviceCheckId: check.id,
      serverId: check.serverId,
      status,
    });
    void notifyServiceCheckAlerts(updated, since);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.serviceCheckResult.create({
      data: { serviceCheckId: check.id, success: false, latencyMs: null },
    });
    const since = computeCheckSinceUpdate(check, "CRITICAL", now);
    const updated = await prisma.serviceCheck.update({
      where: { id: check.id },
      data: {
        lastStatus: "CRITICAL",
        lastCheckedAt: now,
        lastError: message,
        downSince: since.downSince,
        slowSince: since.slowSince,
      },
    });
    publish({
      type: "service-check",
      serviceCheckId: check.id,
      serverId: check.serverId,
      status: "CRITICAL",
    });
    void notifyServiceCheckAlerts(updated, since);
  } finally {
    clearTimeout(timer);
  }
}
