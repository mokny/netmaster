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
import { getOrCreateExploreSettings, reconcileRanges, runDiscoveryScan } from "@/lib/discovery/scan";
import { refreshPollingSettingsCache } from "@/lib/monitor/polling-settings";
import { startPingLoop, stopPingLoop } from "@/lib/monitor/ping-scheduler";
import type { PollingSettings, Server as ServerModel } from "@/generated/prisma/client";

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

// Mindestabstand zwischen zwei automatisch durch einen Seitenaufruf
// angestoßenen Proxmox-/Docker-Status-Polls (verhindert, dass mehrere
// gleichzeitig geöffnete Tabs/Nutzer das seltene vmDockerPollIntervalSec
// faktisch aushebeln).
const PAGE_OPEN_DEBOUNCE_MS = 90_000;
const lastProxmoxPollAt = new Map<string, number>();
const lastDockerPollAt = new Map<string, number>();

export function ensureFreshProxmoxPoll(serverId: string) {
  const last = lastProxmoxPollAt.get(serverId) ?? 0;
  if (Date.now() - last < PAGE_OPEN_DEBOUNCE_MS) return;
  lastProxmoxPollAt.set(serverId, Date.now());
  void prisma.server.findUnique({ where: { id: serverId } }).then((server) => {
    if (server?.proxmoxEnabled) void collectProxmoxVms(server, "on_demand");
  });
}

export function ensureFreshDockerPoll(serverId: string) {
  const last = lastDockerPollAt.get(serverId) ?? 0;
  if (Date.now() - last < PAGE_OPEN_DEBOUNCE_MS) return;
  lastDockerPollAt.set(serverId, Date.now());
  void prisma.server.findUnique({ where: { id: serverId } }).then((server) => {
    if (server?.dockerEnabled) void collectDockerContainers(server, "on_demand");
  });
}

// Schnelles Poll-Intervall (statt vmDockerPollIntervalSec), solange
// mindestens eine VM-/Container-Detailseite des jeweiligen Servers offen ist
// (siehe src/lib/ws/detail-presence-handler.ts). Bündelt pro Host - ein Poll
// deckt alle VMs/Container ab, egal wie viele Detailseiten gerade offen sind.
const FAST_POLL_INTERVAL_MS = 20_000;

interface FastPollSubscription {
  count: number;
  timer: NodeJS.Timeout;
}

function makeFastPollSubscribers(collect: (server: ServerModel) => Promise<void>) {
  const subs = new Map<string, FastPollSubscription>();
  return {
    subscribe(serverId: string) {
      const existing = subs.get(serverId);
      if (existing) {
        existing.count += 1;
        return;
      }
      const timer = setInterval(async () => {
        const server = await prisma.server.findUnique({ where: { id: serverId } });
        if (server) await collect(server);
      }, FAST_POLL_INTERVAL_MS);
      subs.set(serverId, { count: 1, timer });
    },
    unsubscribe(serverId: string) {
      const existing = subs.get(serverId);
      if (!existing) return;
      existing.count -= 1;
      if (existing.count <= 0) {
        clearInterval(existing.timer);
        subs.delete(serverId);
      }
    },
    stopAll() {
      for (const sub of subs.values()) clearInterval(sub.timer);
      subs.clear();
    },
  };
}

const proxmoxFastPoll = makeFastPollSubscribers((server) => collectProxmoxVms(server, "on_demand"));
const dockerFastPoll = makeFastPollSubscribers((server) => collectDockerContainers(server, "on_demand"));

export function subscribeFastProxmoxPoll(serverId: string) {
  proxmoxFastPoll.subscribe(serverId);
}
export function unsubscribeFastProxmoxPoll(serverId: string) {
  proxmoxFastPoll.unsubscribe(serverId);
}
export function subscribeFastDockerPoll(serverId: string) {
  dockerFastPoll.subscribe(serverId);
}
export function unsubscribeFastDockerPoll(serverId: string) {
  dockerFastPoll.unsubscribe(serverId);
}

// Globaler Netzwerk-Scan-Job (Explore) - kein Per-Row-Timer wie oben, da es
// nur eine einzige Konfiguration (ExploreSettings) gibt, kein Set von
// DB-Zeilen. Läuft nur, wenn autoScanEnabled gesetzt ist.
let discoveryTimer: NodeJS.Timeout | null = null;
let discoveryIntervalHr: number | null = null;

async function reconcileDiscovery(discoveryScanEnabled: boolean) {
  const settings = await getOrCreateExploreSettings();
  if (!settings.autoScanEnabled || !discoveryScanEnabled) {
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

interface ServerEffectiveFlags {
  metricsEnabled: boolean;
  dockerContainersEnabled: boolean;
  dockerImagesEnabled: boolean;
  proxmoxEnabled: boolean;
}

function scheduleServer(
  serverId: string,
  intervalSec: number,
  vmDockerIntervalSec: number,
  flags: ServerEffectiveFlags
) {
  clearInterval(serverTimers.get(serverId));
  clearInterval(dockerTimers.get(serverId));
  clearInterval(dockerImageTimers.get(serverId));
  clearInterval(proxmoxTimers.get(serverId));
  serverTimers.delete(serverId);
  dockerTimers.delete(serverId);
  dockerImageTimers.delete(serverId);
  proxmoxTimers.delete(serverId);

  if (flags.metricsEnabled) {
    const metricsTimer = setInterval(async () => {
      const server = await prisma.server.findUnique({ where: { id: serverId } });
      if (server) await collectServerMetrics(server);
    }, Math.max(5, intervalSec) * 1000);
    serverTimers.set(serverId, metricsTimer);
  }

  // Docker-/Proxmox-Status-Poll ist deutlich teurer (SSH-Exec pro Container/VM
  // fürs Auflisten, s. collect.ts) und läuft daher an einem eigenen, viel
  // selteneren Intervall statt an intervalSec - live gehalten wird das Ganze
  // stattdessen über ensureFreshProxmoxPoll/-DockerPoll (Seitenaufruf) und die
  // Fast-Poll-Subscriber (offene Detailseite), siehe oben.
  const vmDockerMs = Math.max(300, vmDockerIntervalSec) * 1000;

  if (flags.dockerContainersEnabled) {
    const dockerTimer = setInterval(async () => {
      const server = await prisma.server.findUnique({ where: { id: serverId } });
      if (server) await collectDockerContainers(server);
    }, vmDockerMs);
    dockerTimers.set(serverId, dockerTimer);
  }

  if (flags.dockerImagesEnabled) {
    const dockerImageTimer = setInterval(async () => {
      const server = await prisma.server.findUnique({ where: { id: serverId } });
      if (server) await collectDockerImages(server);
    }, vmDockerMs);
    dockerImageTimers.set(serverId, dockerImageTimer);
  }

  if (flags.proxmoxEnabled) {
    const proxmoxTimer = setInterval(async () => {
      const server = await prisma.server.findUnique({ where: { id: serverId } });
      if (server) await collectProxmoxVms(server);
    }, vmDockerMs);
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
  const polling: PollingSettings = await refreshPollingSettingsCache();

  const servers = await prisma.server.findMany();
  const activeServerIds = new Set(servers.map((s) => s.id));

  for (const server of servers) {
    const flags: ServerEffectiveFlags = {
      metricsEnabled: polling.serverMetricsEnabled,
      dockerContainersEnabled: polling.dockerContainersEnabled && server.dockerEnabled,
      dockerImagesEnabled: polling.dockerImagesEnabled && server.dockerEnabled,
      proxmoxEnabled: polling.proxmoxVmsEnabled && server.proxmoxEnabled,
    };
    const config = `${server.pollIntervalSec}:${server.vmDockerPollIntervalSec}:${flags.metricsEnabled}:${flags.dockerContainersEnabled}:${flags.dockerImagesEnabled}:${flags.proxmoxEnabled}`;
    const isNew = !serverConfigs.has(server.id);
    const changed = serverConfigs.get(server.id) !== config;
    if (isNew || changed) {
      scheduleServer(server.id, server.pollIntervalSec, server.vmDockerPollIntervalSec, flags);
      serverConfigs.set(server.id, config);
      if (isNew) {
        // Sofortiger erster Poll, statt auf das erste Intervall zu warten.
        if (flags.metricsEnabled) void collectServerMetrics(server);
        if (flags.dockerContainersEnabled) void collectDockerContainers(server);
        if (flags.dockerImagesEnabled) void collectDockerImages(server);
        if (flags.proxmoxEnabled) void collectProxmoxVms(server);
      }
    }
  }
  for (const id of serverConfigs.keys()) {
    if (!activeServerIds.has(id)) {
      const metricsTimer = serverTimers.get(id);
      if (metricsTimer) clearInterval(metricsTimer);
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

  if (!polling.uptimeChecksEnabled) {
    for (const timer of checkTimers.values()) clearInterval(timer);
    checkTimers.clear();
    checkIntervals.clear();
  } else {
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

  if (!polling.routerDevicesEnabled) {
    for (const timer of routerTimers.values()) clearInterval(timer);
    routerTimers.clear();
    routerIntervals.clear();
  } else {
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
  }

  await reconcileRanges();
  await reconcileDiscovery(polling.discoveryScanEnabled);

  if (polling.pingEnabled) {
    startPingLoop(polling.pingIntervalSec);
  } else {
    stopPingLoop();
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
  proxmoxFastPoll.stopAll();
  dockerFastPoll.stopAll();
  stopPingLoop();
  closeAllPooledConnections();
}
