import { prisma } from "@/lib/prisma";
import {
  collectServerMetrics,
  collectDockerContainers,
  collectProxmoxVms,
  runServiceCheck,
} from "./collect";

const serverTimers = new Map<string, NodeJS.Timeout>();
const dockerTimers = new Map<string, NodeJS.Timeout>();
const proxmoxTimers = new Map<string, NodeJS.Timeout>();
const checkTimers = new Map<string, NodeJS.Timeout>();
const serverIntervals = new Map<string, number>();
const checkIntervals = new Map<string, number>();

const RECONCILE_INTERVAL_MS = 15_000;
let reconcileTimer: NodeJS.Timeout | null = null;

function scheduleServer(serverId: string, intervalSec: number) {
  clearInterval(serverTimers.get(serverId));
  clearInterval(dockerTimers.get(serverId));
  clearInterval(proxmoxTimers.get(serverId));

  const metricsTimer = setInterval(async () => {
    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (server) await collectServerMetrics(server);
  }, Math.max(5, intervalSec) * 1000);
  serverTimers.set(serverId, metricsTimer);

  // Docker-Snapshot etwas seltener (2x Intervall), um SSH-Last gering zu halten.
  const dockerTimer = setInterval(async () => {
    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (server) await collectDockerContainers(server);
  }, Math.max(10, intervalSec * 2) * 1000);
  dockerTimers.set(serverId, dockerTimer);

  // Proxmox-VMs im selben Intervall wie die Host-Metriken, damit VM- und
  // Host-Graphen zeitlich vergleichbar sind.
  const proxmoxTimer = setInterval(async () => {
    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (server) await collectProxmoxVms(server);
  }, Math.max(5, intervalSec) * 1000);
  proxmoxTimers.set(serverId, proxmoxTimer);
}

function scheduleCheck(checkId: string, intervalSec: number) {
  clearInterval(checkTimers.get(checkId));
  const timer = setInterval(async () => {
    const check = await prisma.serviceCheck.findUnique({ where: { id: checkId } });
    if (check) await runServiceCheck(check);
  }, Math.max(5, intervalSec) * 1000);
  checkTimers.set(checkId, timer);
}

async function reconcile() {
  const servers = await prisma.server.findMany();
  const activeServerIds = new Set(servers.map((s) => s.id));

  for (const server of servers) {
    const changed = serverIntervals.get(server.id) !== server.pollIntervalSec;
    if (!serverTimers.has(server.id) || changed) {
      scheduleServer(server.id, server.pollIntervalSec);
      serverIntervals.set(server.id, server.pollIntervalSec);
      if (!changed) {
        // Sofortiger erster Poll, statt auf das erste Intervall zu warten.
        void collectServerMetrics(server);
        void collectDockerContainers(server);
        void collectProxmoxVms(server);
      }
    }
  }
  for (const [id, timer] of serverTimers) {
    if (!activeServerIds.has(id)) {
      clearInterval(timer);
      serverTimers.delete(id);
      const dockerTimer = dockerTimers.get(id);
      if (dockerTimer) clearInterval(dockerTimer);
      dockerTimers.delete(id);
      const proxmoxTimer = proxmoxTimers.get(id);
      if (proxmoxTimer) clearInterval(proxmoxTimer);
      proxmoxTimers.delete(id);
      serverIntervals.delete(id);
    }
  }

  const checks = await prisma.serviceCheck.findMany();
  const activeCheckIds = new Set(checks.map((c) => c.id));
  for (const check of checks) {
    const changed = checkIntervals.get(check.id) !== check.intervalSec;
    if (!checkTimers.has(check.id) || changed) {
      scheduleCheck(check.id, check.intervalSec);
      checkIntervals.set(check.id, check.intervalSec);
      if (!changed) void runServiceCheck(check);
    }
  }
  for (const [id, timer] of checkTimers) {
    if (!activeCheckIds.has(id)) {
      clearInterval(timer);
      checkTimers.delete(id);
      checkIntervals.delete(id);
    }
  }
}

let started = false;

export function startMonitorScheduler() {
  if (started) return;
  started = true;
  void reconcile();
  reconcileTimer = setInterval(reconcile, RECONCILE_INTERVAL_MS);
}

export function stopMonitorScheduler() {
  started = false;
  if (reconcileTimer) clearInterval(reconcileTimer);
  for (const t of serverTimers.values()) clearInterval(t);
  for (const t of dockerTimers.values()) clearInterval(t);
  for (const t of proxmoxTimers.values()) clearInterval(t);
  for (const t of checkTimers.values()) clearInterval(t);
  serverTimers.clear();
  dockerTimers.clear();
  proxmoxTimers.clear();
  checkTimers.clear();
}
