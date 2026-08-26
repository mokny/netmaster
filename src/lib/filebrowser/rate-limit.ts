// Einfaches In-Memory-Rate-Limiting für den Filebrowser-Login, pro
// (IP, serverId, username) - schützt die per SSH ausgeführte Live-Prüfung
// (verifyPasswordAuth) vor Brute-Force. Bewusst simpel (flaches Fenster statt
// exponentiellem Backoff) statt einer eigenen DB-Tabelle o.ä., da NetMaster
// bei Neustart ohnehin alle Filebrowser-Sessions verwirft.
const MAX_FAILURES = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;

interface RateEntry {
  failures: number;
  lockedUntil: number | null;
}

const attempts = new Map<string, RateEntry>();

function key(ip: string, serverId: string, username: string): string {
  return `${ip}::${serverId}::${username}`;
}

// Liefert die verbleibende Sperrzeit in ms, oder 0 wenn nicht (mehr) gesperrt.
export function getLockRemainingMs(ip: string, serverId: string, username: string): number {
  const entry = attempts.get(key(ip, serverId, username));
  if (!entry?.lockedUntil) return 0;
  const remaining = entry.lockedUntil - Date.now();
  if (remaining <= 0) {
    attempts.delete(key(ip, serverId, username));
    return 0;
  }
  return remaining;
}

export function recordLoginFailure(ip: string, serverId: string, username: string): void {
  const k = key(ip, serverId, username);
  const entry = attempts.get(k) ?? { failures: 0, lockedUntil: null };
  entry.failures += 1;
  if (entry.failures >= MAX_FAILURES) {
    entry.lockedUntil = Date.now() + LOCK_WINDOW_MS;
  }
  attempts.set(k, entry);
}

export function recordLoginSuccess(ip: string, serverId: string, username: string): void {
  attempts.delete(key(ip, serverId, username));
}
