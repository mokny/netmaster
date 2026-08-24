import { prisma } from "@/lib/prisma";
import { runPingCheck } from "@/lib/ping";
import { parseIpsJson } from "./ip-cache";
import { publish } from "./events";
import { logPoll } from "./poll-log";

const PING_TIMEOUT_MS = 2000;
// Wie viele Hosts maximal gleichzeitig gepingt werden - begrenzt die Anzahl
// paralleler `ping`-Kindprozesse bei vielen VMs/Containern.
const CONCURRENCY = 10;

let timer: NodeJS.Timeout | null = null;
let currentIntervalSec: number | null = null;
let running = false;

interface PingTarget {
  serverId: string;
  kind: "vm" | "docker";
  vmid?: number;
  containerId?: string;
  ips: string[];
}

// Liest die zu pingenden Ziele direkt aus der DB (ProxmoxVm/DockerContainerState.
// ipsJson) statt aus dem In-Memory-Cache - macht den Ping unabhängig von einem
// warmen Cache und robust gegen Neustarts (siehe ip-discovery-scheduler.ts, das
// diese Felder alle 5 Min aktuell hält).
async function loadPingTargets(): Promise<PingTarget[]> {
  const [vms, containers] = await Promise.all([
    prisma.proxmoxVm.findMany({
      where: { status: "running" },
      select: { serverId: true, vmid: true, ipsJson: true },
    }),
    prisma.dockerContainerState.findMany({
      where: { running: true },
      select: { serverId: true, containerId: true, ipsJson: true },
    }),
  ]);

  const targets: PingTarget[] = [];
  for (const vm of vms) {
    const ips = parseIpsJson(vm.ipsJson);
    if (ips.length > 0) targets.push({ serverId: vm.serverId, kind: "vm", vmid: vm.vmid, ips });
  }
  for (const c of containers) {
    const ips = parseIpsJson(c.ipsJson);
    if (ips.length > 0) targets.push({ serverId: c.serverId, kind: "docker", containerId: c.containerId, ips });
  }
  return targets;
}

async function pingAllKnownHosts() {
  if (running) return;
  running = true;
  try {
    const targets = await loadPingTargets();
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const batch = targets.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (target) => {
          const result = await runPingCheck(target.ips[0], PING_TIMEOUT_MS);
          logPoll(target.serverId, "ping", result.success);
          publish({
            type: "ping",
            serverId: target.serverId,
            kind: target.kind,
            vmid: target.vmid,
            containerId: target.containerId,
            alive: result.success,
            latencyMs: result.latencyMs,
          });
        })
      );
    }
  } finally {
    running = false;
  }
}

// Zentraler Reachability-Check (kein SSH, läuft direkt vom Netmaster-Server
// gegen bekannte VM-/Container-IPs) - ersetzt den bisherigen häufigen
// Proxmox-/Docker-Status-Poll als Live-Signal, siehe scheduler.ts reconcile().
export function startPingLoop(intervalSec: number) {
  if (timer && currentIntervalSec === intervalSec) return;
  if (timer) clearInterval(timer);
  currentIntervalSec = intervalSec;
  timer = setInterval(() => void pingAllKnownHosts(), Math.max(5, intervalSec) * 1000);
}

export function stopPingLoop() {
  if (timer) clearInterval(timer);
  timer = null;
  currentIntervalSec = null;
}
