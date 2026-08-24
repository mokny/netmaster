// Kurzzeit-Cache für per SSH ermittelte IPs von Docker-Containern und
// Proxmox-VMs/LXCs. Die dauerhafte Quelle ist seit dem Advanced-Polling-Umbau
// das ipsJson-Feld auf ProxmoxVm/DockerContainerState (siehe collect.ts) - diese
// Map dient nur noch als TTL-/Inflight-Bookkeeping, um innerhalb eines
// Poll-Zyklus nicht mehrfach dieselbe teure SSH-IP-Abfrage auszulösen.
const TTL_MS = 5 * 60_000;

interface CacheEntry {
  ips: string[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Set<string>();

export function dockerIpKey(serverId: string, containerId: string): string {
  return `docker:${serverId}:${containerId}`;
}

export function vmIpKey(serverId: string, vmid: number): string {
  return `vm:${serverId}:${vmid}`;
}

// Liefert den zuletzt bekannten Wert auch dann, wenn er abgelaufen ist -
// vermeidet Flackern in der UI, während im Hintergrund neu abgefragt wird.
export function getCachedIps(key: string): string[] | undefined {
  return cache.get(key)?.ips;
}

function isStale(key: string): boolean {
  const entry = cache.get(key);
  if (!entry) return true;
  return Date.now() - entry.fetchedAt > TTL_MS;
}

export function setCachedIps(key: string, ips: string[]) {
  cache.set(key, { ips, fetchedAt: Date.now() });
}

// Stößt bei Bedarf (Cache fehlt/abgelaufen, kein Fetch bereits unterwegs) den
// übergebenen Fetcher im Hintergrund an, ohne den aufrufenden Poll zu blockieren.
// force=true überspringt den TTL-Check (manueller "IP aktualisieren"-Button).
export function refreshIfStale(
  key: string,
  fetcher: () => Promise<string[]>,
  force = false
): Promise<void> {
  if ((!force && !isStale(key)) || inFlight.has(key)) return Promise.resolve();
  inFlight.add(key);
  return fetcher()
    .then((ips) => setCachedIps(key, ips))
    .catch(() => {
      // Kein Guest-Agent / Container gestoppt / SSH-Fehler - einfach beim
      // nächsten Intervall erneut versuchen, kein harter Fehler.
    })
    .finally(() => inFlight.delete(key));
}

export function removeCachedIp(key: string) {
  cache.delete(key);
}

// Parst das persistierte ipsJson-Feld (ProxmoxVm/DockerContainerState) sicher -
// liefert [] statt zu werfen, falls der Wert (noch) kein valides JSON-Array ist.
export function parseIpsJson(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
