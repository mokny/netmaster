// In-Memory-Cache für per SSH ermittelte IPs von Docker-Containern und
// Proxmox-VMs/LXCs. Bewusst nicht in der DB persistiert (siehe collect.ts) -
// geht bei Neustart/Deploy verloren und wird beim nächsten Poll neu ermittelt.
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

// Für den Ping-Scheduler (ping-scheduler.ts): alle aktuell bekannten
// VM-/Container-IPs, unabhängig davon ob der Eintrag noch "frisch" ist -
// Ping soll auch mit einer veralteten, aber zuletzt bekannten IP versuchen.
export function getAllCachedIpEntries(): { key: string; ips: string[] }[] {
  return [...cache.entries()]
    .filter(([, entry]) => entry.ips.length > 0)
    .map(([key, entry]) => ({ key, ips: entry.ips }));
}

// Reichert eine Liste von DB-Zeilen (Docker-Container-Snapshots /
// Proxmox-VMs) um die zuletzt bekannte(n) IP(s) aus dem Cache an, ohne dass
// dafür ein DB-Feld existieren muss (siehe collect.ts).
export function attachIps<T>(rows: T[], keyOf: (row: T) => string): (T & { ips: string[] })[] {
  return rows.map((row) => ({ ...row, ips: getCachedIps(keyOf(row)) ?? [] }));
}
