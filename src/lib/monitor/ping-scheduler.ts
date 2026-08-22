import { runPingCheck } from "@/lib/ping";
import { getAllCachedIpEntries } from "./ip-cache";
import { publish } from "./events";
import { logPoll } from "./poll-log";

const PING_TIMEOUT_MS = 2000;
// Wie viele Hosts maximal gleichzeitig gepingt werden - begrenzt die Anzahl
// paralleler `ping`-Kindprozesse bei vielen VMs/Containern.
const CONCURRENCY = 10;

let timer: NodeJS.Timeout | null = null;
let currentIntervalSec: number | null = null;
let running = false;

function parseKey(key: string): { serverId: string; kind: "vm" | "docker"; vmid?: number; containerId?: string } | null {
  const [kind, serverId, rest] = key.split(":");
  if (!kind || !serverId || rest === undefined) return null;
  if (kind === "vm") {
    const vmid = Number(rest);
    if (!Number.isInteger(vmid)) return null;
    return { serverId, kind: "vm", vmid };
  }
  if (kind === "docker") {
    return { serverId, kind: "docker", containerId: rest };
  }
  return null;
}

async function pingAllKnownHosts() {
  if (running) return;
  running = true;
  try {
    const entries = getAllCachedIpEntries();
    for (let i = 0; i < entries.length; i += CONCURRENCY) {
      const batch = entries.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async ({ key, ips }) => {
          const target = parseKey(key);
          if (!target) return;
          const result = await runPingCheck(ips[0], PING_TIMEOUT_MS);
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
