import { prisma } from "@/lib/prisma";
import {
  collectServerMetrics,
  collectDockerContainers,
  collectDockerImages,
  collectProxmoxVms,
  runServiceCheck,
} from "./collect";
import { collectRouterDevice } from "./router-collect";
import { invalidatePooledConnection, closeAllPooledConnections } from "@/lib/ssh-pool";
import { getOrCreateExploreSettings, runDiscoveryScan } from "@/lib/discovery/scan";

const serverTimers = new Map<string, NodeJS.Timeout>();
const dockerTimers = new Map<string, NodeJS.Timeout>();
const dockerImageTimers = new Map<string, NodeJS.Timeout>();
const proxmoxTimers = new Map<string, NodeJS.Timeout>();
const checkTimers = new Map<string, NodeJS.Timeout>();
const routerTimers = new Map<string, NodeJS.Timeout>();
const routerIntervals = new Map<string, number>();
// Signatur aus Poll-Intervall + Docker/Proxmox-Flags – ein Wechsel eines
// dieser Werte löst ein Neuplanen der Timer für diesen Server aus.
const serverConfigs = new Map<string, string>();
const checkIntervals = new Map<string, number>();

const RECONCILE_INTERVAL_MS = 15_000;
let reconcileTimer: NodeJS.Timeout | null = null;

// Globaler Netzwerk-Scan-Job (Explore) - kein Per-Row-Timer wie oben, da es
// nur eine einzige Konfiguration (ExploreSettings) gibt, kein Set von
// DB-Zeilen. Läuft nur, wenn autoScanEnabled gesetzt ist.
let discoveryTimer: NodeJS.Timeout | null = null;
let discoveryIntervalHr: number | null = null;

async function reconcileDiscovery() {
  const settings = await getOrCreateExploreSettings();
  if (!settings.autoScanEnabled) {
    if (discoveryTimer) {
      clearInterval(discoveryTimer);
      discoveryTimer = null;
      discoveryIntervalHr = null;
    }
    return;
  }
  if (discoveryTimer && discoveryIntervalHr === settings.autoScanIntervalHr) return;

  if (discoveryTimer) clearInterval(discoveryTimer);
  discoveryIntervalHr = settings.autoScanIntervalHr;
  discoveryTimer = setInterval(
    () => void runDiscoveryScan(),
    settings.autoScanIntervalHr * 3_600_000
  );
}

function scheduleServer(
  serverId: string,
  intervalSec: number,
  dockerEnabled: boolean,
  proxmoxEnabled: boolean
) {
  clearInterval(serverTimers.get(serverId));
  clearInterval(dockerTimers.get(serverId));
  clearInterval(dockerImageTimers.get(serverId));
  clearInterval(proxmoxTimers.get(serverId));
  dockerTimers.delete(serverId);
  dockerImageTimers.delete(serverId);
  proxmoxTimers.delete(serverId);

  const metricsTimer = setInterval(async () => {
    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (server) await collectServerMetrics(server);
  }, Math.max(5, intervalSec) * 1000);
  serverTimers.set(serverId, metricsTimer);

  if (dockerEnabled) {
    // Docker-Snapshots etwas seltener (2x Intervall), um SSH-Last gering zu halten.
    const dockerTimer = setInterval(async () => {
      const server = await prisma.server.findUnique({ where: { id: serverId } });
      if (server) await collectDockerContainers(server);
    }, Math.max(10, intervalSec * 2) * 1000);
    dockerTimers.set(serverId, dockerTimer);

    const dockerImageTimer = setInterval(async () => {
      const server = await prisma.server.findUnique({ where: { id: serverId } });
      if (server) await collectDockerImages(server);
    }, Math.max(10, intervalSec * 2) * 1000);
    dockerImageTimers.set(serverId, dockerImageTimer);
  }

  if (proxmoxEnabled) {
    // Proxmox-VMs im selben Intervall wie die Host-Metriken, damit VM- und
    // Host-Graphen zeitlich vergleichbar sind.
    const proxmoxTimer = setInterval(async () => {
      const server = await prisma.server.findUnique({ where: { id: serverId } });
      if (server) await collectProxmoxVms(server);
    }, Math.max(5, intervalSec) * 1000);
    proxmoxTimers.set(serverId, proxmoxTimer);
  }
}

function scheduleRouterDevice(deviceId: string, intervalSec: number) {
  clearInterval(routerTimers.get(deviceId));
  const timer = setInterval(async () => {
    const device = await prisma.routerDevice.findUnique({ where: { id: deviceId } });
    if (device) await collectRouterDevice(device);
  }, Math.max(15, intervalSec) * 1000);
  routerTimers.set(deviceId, timer);
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
    const config = `${server.pollIntervalSec}:${server.dockerEnabled}:${server.proxmoxEnabled}`;
    const isNew = !serverTimers.has(server.id);
    const changed = serverConfigs.get(server.id) !== config;
    if (isNew || changed) {
      scheduleServer(
        server.id,
        server.pollIntervalSec,
        server.dockerEnabled,
        server.proxmoxEnabled
      );
      serverConfigs.set(server.id, config);
      if (isNew) {
        // Sofortiger erster Poll, statt auf das erste Intervall zu warten.
        void collectServerMetrics(server);
        if (server.dockerEnabled) {
          void collectDockerContainers(server);
          void collectDockerImages(server);
        }
        if (server.proxmoxEnabled) void collectProxmoxVms(server);
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
      const dockerImageTimer = dockerImageTimers.get(id);
      if (dockerImageTimer) clearInterval(dockerImageTimer);
      dockerImageTimers.delete(id);
      const proxmoxTimer = proxmoxTimers.get(id);
      if (proxmoxTimer) clearInterval(proxmoxTimer);
      proxmoxTimers.delete(id);
      serverConfigs.delete(id);
      invalidatePooledConnection(id);
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

  const routerDevices = await prisma.routerDevice.findMany();
  const activeRouterIds = new Set(routerDevices.map((d) => d.id));
  for (const device of routerDevices) {
    const changed = routerIntervals.get(device.id) !== device.pollIntervalSec;
    const isNew = !routerTimers.has(device.id);
    if (isNew || changed) {
      scheduleRouterDevice(device.id, device.pollIntervalSec);
      routerIntervals.set(device.id, device.pollIntervalSec);
      if (isNew) void collectRouterDevice(device);
    }
  }
  for (const [id, timer] of routerTimers) {
    if (!activeRouterIds.has(id)) {
      clearInterval(timer);
      routerTimers.delete(id);
      routerIntervals.delete(id);
    }
  }

  await reconcileDiscovery();
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
  if (discoveryTimer) clearInterval(discoveryTimer);
  discoveryTimer = null;
  discoveryIntervalHr = null;
  for (const t of serverTimers.values()) clearInterval(t);
  for (const t of dockerTimers.values()) clearInterval(t);
  for (const t of dockerImageTimers.values()) clearInterval(t);
  for (const t of proxmoxTimers.values()) clearInterval(t);
  for (const t of checkTimers.values()) clearInterval(t);
  for (const t of routerTimers.values()) clearInterval(t);
  serverTimers.clear();
  dockerTimers.clear();
  dockerImageTimers.clear();
  proxmoxTimers.clear();
  checkTimers.clear();
  routerTimers.clear();
  routerIntervals.clear();
  serverConfigs.clear();
  closeAllPooledConnections();
}
