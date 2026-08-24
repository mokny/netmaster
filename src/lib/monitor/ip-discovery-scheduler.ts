import { prisma } from "@/lib/prisma";
import { refreshDockerIp, refreshVmIp } from "./collect";

// Leichtgewichtiger, immer aktiver Hintergrund-Job (fest 5 Min, nicht über
// PollingSettings steuerbar): aktualisiert nur die IPs bereits bekannter,
// laufender VMs/Container (keine neue Discovery von VMs/Containern selbst -
// das passiert nur bei einem vollen Poll, siehe collect.ts), damit der
// Ping-Scheduler unabhängig von manuellem Refresh/Advanced Polling stets
// aktuelle Ziel-IPs in der DB vorfindet.
const INTERVAL_MS = 5 * 60_000;
// Wie viele SSH-IP-Abfragen maximal gleichzeitig laufen.
const CONCURRENCY = 10;

let timer: NodeJS.Timeout | null = null;
let running = false;

async function runIpDiscovery() {
  if (running) return;
  running = true;
  try {
    const [runningVms, runningContainers] = await Promise.all([
      prisma.proxmoxVm.findMany({ where: { status: "running" }, include: { server: true } }),
      prisma.dockerContainerState.findMany({ where: { running: true }, include: { server: true } }),
    ]);

    for (let i = 0; i < runningVms.length; i += CONCURRENCY) {
      const batch = runningVms.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map((vm) =>
          refreshVmIp(vm.server, vm.type === "QEMU" ? "qemu" : "lxc", vm.vmid, true)
        )
      );
    }

    for (let i = 0; i < runningContainers.length; i += CONCURRENCY) {
      const batch = runningContainers.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map((c) => refreshDockerIp(c.server, c.containerId, true))
      );
    }
  } finally {
    running = false;
  }
}

export function startIpDiscoveryLoop() {
  if (timer) return;
  timer = setInterval(() => void runIpDiscovery(), INTERVAL_MS);
  void runIpDiscovery();
}

export function stopIpDiscoveryLoop() {
  if (timer) clearInterval(timer);
  timer = null;
}
