import { prisma } from "@/lib/prisma";
import {
  METRICS_COMMAND,
  DOCKER_COMMAND,
  DOCKER_IMAGES_COMMAND,
  PROXMOX_COMMAND,
} from "@/lib/ssh";
import { execPooled, invalidatePooledConnection } from "@/lib/ssh-pool";
import {
  parseMetricsOutput,
  parseDockerOutput,
  parseDockerImagesOutput,
  parseProxmoxOutput,
} from "./parse";
import { computeServerStatus, type MetricKey, type StatusValue } from "./status";
import { publish } from "./events";
import { notifyServerEvent, sendPushToUser, type NotificationEvent } from "@/lib/push";
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
        ...(metrics.cpuCores !== null && { cpuCores: metrics.cpuCores }),
        ...(metrics.memTotalMb !== null && { memTotalMb: metrics.memTotalMb }),
        ...(metrics.osName !== null && { osName: metrics.osName }),
        ...(metrics.kernelVersion !== null && { kernelVersion: metrics.kernelVersion }),
        ...(metrics.uptimeSeconds !== null && {
          bootedAt: new Date(Date.now() - metrics.uptimeSeconds * 1000),
        }),
      },
    });

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
    void notifyMetricTransitions(server, result.metrics);

    const cutoff = new Date(
      Date.now() - server.retentionDays * 24 * 60 * 60 * 1000
    );
    await prisma.metricSample.deleteMany({
      where: { serverId: server.id, timestamp: { lt: cutoff } },
    });
    await prisma.diskSample.deleteMany({
      where: { serverId: server.id, timestamp: { lt: cutoff } },
    });
  } catch (err) {
    invalidatePooledConnection(server.id);
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    await prisma.server.update({
      where: { id: server.id },
      data: {
        lastStatus: "CRITICAL",
        lastError: message,
        lastCheckedAt: new Date(),
      },
    });
    publish({
      type: "server-status",
      serverId: server.id,
      status: "CRITICAL",
      error: message,
    });
    if (!server.lastError) {
      void notifyServerEvent(server.id, "offlineEnabled", {
        title: `${server.name}: nicht erreichbar`,
        body: message,
        url: `/servers/${server.id}`,
      });
    }
  }
}

const METRIC_LABELS: Record<MetricKey, string> = {
  cpu: "CPU-Auslastung",
  mem: "RAM-Auslastung",
  disk: "Disk-Auslastung",
  net: "Netzwerk-Durchsatz",
};

const METRIC_PREV_FIELD: Record<MetricKey, "lastCpuStatus" | "lastMemStatus" | "lastDiskStatus" | "lastNetStatus"> = {
  cpu: "lastCpuStatus",
  mem: "lastMemStatus",
  disk: "lastDiskStatus",
  net: "lastNetStatus",
};

const METRIC_EVENTS: Record<MetricKey, { warn: NotificationEvent; crit: NotificationEvent }> = {
  cpu: { warn: "cpuWarnEnabled", crit: "cpuCritEnabled" },
  mem: { warn: "memWarnEnabled", crit: "memCritEnabled" },
  disk: { warn: "diskWarnEnabled", crit: "diskCritEnabled" },
  net: { warn: "netWarnEnabled", crit: "netCritEnabled" },
};

// Löst Push-Benachrichtigungen pro Einzelmetrik bei Statuswechseln aus
// (Flanken-getriggert, nicht bei jedem Poll) - sowohl beim Verschlechtern als
// auch beim Erholen. Jede Metrik hat ihr eigenes Warn-/Kritisch-Toggle in den
// NotificationPreference (z.B. cpuCritEnabled), damit z.B. Disk-Warnungen
// unabhängig von CPU-Warnungen an/aus geschaltet werden können.
async function notifyMetricTransitions(server: ServerModel, newStatuses: Record<MetricKey, StatusValue>) {
  for (const key of Object.keys(newStatuses) as MetricKey[]) {
    const oldStatus = server[METRIC_PREV_FIELD[key]] as StatusValue;
    const newStatus = newStatuses[key];
    if (newStatus === oldStatus) continue;

    const label = METRIC_LABELS[key];
    const events = METRIC_EVENTS[key];

    if (newStatus === "CRITICAL" && oldStatus !== "CRITICAL") {
      void notifyServerEvent(server.id, events.crit, {
        title: `${server.name}: ${label} kritisch`,
        body: `${label} liegt im kritischen Bereich.`,
        url: `/servers/${server.id}`,
      });
    } else if (newStatus === "WARNING" && oldStatus !== "WARNING" && oldStatus !== "CRITICAL") {
      void notifyServerEvent(server.id, events.warn, {
        title: `${server.name}: ${label} Warnung`,
        body: `${label} liegt im Warnbereich.`,
        url: `/servers/${server.id}`,
      });
    } else if (newStatus === "OK" && (oldStatus === "WARNING" || oldStatus === "CRITICAL")) {
      const event = oldStatus === "CRITICAL" ? events.crit : events.warn;
      void notifyServerEvent(server.id, event, {
        title: `${server.name}: ${label} wieder normal`,
        body: `${label} ist wieder im Normalbereich.`,
        url: `/servers/${server.id}`,
      });
    }
  }
}

export async function collectDockerContainers(server: ServerModel) {
  if (!server.dockerEnabled) return;
  try {
    const { stdout } = await execPooled(server, DOCKER_COMMAND);
    const containers = parseDockerOutput(stdout);

    const previousStates = await lastKnownContainerStates(server.id);

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

    publish({ type: "docker", serverId: server.id, containers });

    for (const c of containers) {
      const wasRunning = previousStates.get(c.containerId);
      const isRunning = c.state.toLowerCase() === "running";
      if (wasRunning === true && !isRunning) {
        void notifyServerEvent(server.id, "dockerStoppedEnabled", {
          title: `${server.name}: Container gestoppt`,
          body: `Container "${c.name}" läuft nicht mehr (Status: ${c.state}).`,
          url: `/servers/${server.id}`,
        });
      }
    }

    // Nur die letzte Momentaufnahme pro Server behalten, um die DB schlank zu halten.
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.dockerContainerSnapshot.deleteMany({
      where: { serverId: server.id, timestamp: { lt: cutoff } },
    });
  } catch {
    // Server hat evtl. kein Docker installiert – kein harter Fehler.
  }
}

// Liest den Zustand (läuft/läuft nicht) jedes Containers aus der jeweils
// letzten Momentaufnahme vor diesem Poll, um Stopp-Übergänge zu erkennen.
async function lastKnownContainerStates(serverId: string): Promise<Map<string, boolean>> {
  const latest = await prisma.dockerContainerSnapshot.findFirst({
    where: { serverId },
    orderBy: { timestamp: "desc" },
    select: { timestamp: true },
  });
  if (!latest) return new Map();

  const rows = await prisma.dockerContainerSnapshot.findMany({
    where: { serverId, timestamp: latest.timestamp },
    select: { containerId: true, state: true },
  });
  return new Map(rows.map((r) => [r.containerId, r.state.toLowerCase() === "running"]));
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
  } catch {
    // Server hat evtl. kein Docker installiert – kein harter Fehler.
  }
}

export async function collectProxmoxVms(server: ServerModel) {
  if (!server.proxmoxEnabled) return;
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
  } catch {
    // Server hat evtl. kein Proxmox installiert – kein harter Fehler.
  }
}

// Benachrichtigt bei einem Statuswechsel nach CRITICAL alle Abonnenten eines
// freistehenden (serverId=null) Checks. Serverbezogene Checks lösen bewusst
// keine eigene Push-Benachrichtigung aus - dafür gibt es die Server-Events.
async function notifyServiceCheckDown(check: ServiceCheck, previousStatus: string) {
  if (check.serverId || previousStatus === "CRITICAL") return;
  const subscribers = await prisma.serviceCheckSubscriber.findMany({
    where: { serviceCheckId: check.id },
    select: { userId: true },
  });
  await Promise.all(
    subscribers.map((s) =>
      sendPushToUser(s.userId, {
        title: `${check.name} nicht erreichbar`,
        body: check.lastError || `${check.url} antwortet nicht wie erwartet`,
      })
    )
  );
}

export async function runServiceCheck(check: ServiceCheck) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), check.timeoutMs);
  const start = Date.now();
  const previousStatus = check.lastStatus;

  try {
    const res = await fetch(check.url, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
    });
    const latencyMs = Date.now() - start;
    const success = res.status === check.expectedStatus;

    await prisma.serviceCheckResult.create({
      data: {
        serviceCheckId: check.id,
        success,
        statusCode: res.status,
        latencyMs,
      },
    });

    const status = success ? "OK" : "CRITICAL";
    const updated = await prisma.serviceCheck.update({
      where: { id: check.id },
      data: {
        lastStatus: status,
        lastLatencyMs: latencyMs,
        lastCheckedAt: new Date(),
        lastError: success ? null : `Unerwarteter Status-Code: ${res.status}`,
      },
    });

    publish({
      type: "service-check",
      serviceCheckId: check.id,
      serverId: check.serverId,
      status,
    });
    if (!success) void notifyServiceCheckDown(updated, previousStatus);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    await prisma.serviceCheckResult.create({
      data: { serviceCheckId: check.id, success: false, latencyMs: null },
    });
    const updated = await prisma.serviceCheck.update({
      where: { id: check.id },
      data: {
        lastStatus: "CRITICAL",
        lastCheckedAt: new Date(),
        lastError: message,
      },
    });
    publish({
      type: "service-check",
      serviceCheckId: check.id,
      serverId: check.serverId,
      status: "CRITICAL",
    });
    void notifyServiceCheckDown(updated, previousStatus);
  } finally {
    clearTimeout(timer);
  }
}
