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
import { computeServerStatus } from "./status";
import { publish } from "./events";
import type { Server as ServerModel, ServiceCheck } from "@/generated/prisma/client";

export async function collectServerMetrics(server: ServerModel) {
  try {
    const { stdout } = await execPooled(server, METRICS_COMMAND);
    const metrics = parseMetricsOutput(stdout);
    const status = computeServerStatus(server, metrics);

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
  }
}

export async function collectDockerContainers(server: ServerModel) {
  if (!server.dockerEnabled) return;
  try {
    const { stdout } = await execPooled(server, DOCKER_COMMAND);
    const containers = parseDockerOutput(stdout);

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

    // Nur die letzte Momentaufnahme pro Server behalten, um die DB schlank zu halten.
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.dockerContainerSnapshot.deleteMany({
      where: { serverId: server.id, timestamp: { lt: cutoff } },
    });
  } catch {
    // Server hat evtl. kein Docker installiert – kein harter Fehler.
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

export async function runServiceCheck(check: ServiceCheck) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), check.timeoutMs);
  const start = Date.now();

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
    await prisma.serviceCheck.update({
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
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    await prisma.serviceCheckResult.create({
      data: { serviceCheckId: check.id, success: false, latencyMs: null },
    });
    await prisma.serviceCheck.update({
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
  } finally {
    clearTimeout(timer);
  }
}
