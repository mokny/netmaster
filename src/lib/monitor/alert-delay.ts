// Gemeinsame "verzögerter Alarm + Recovery"-Logik für Server-Metriken,
// Offline/Docker-Events und Upchecker-Checks. Kommt ohne Merken eines
// "bereits benachrichtigt"-Zustands pro User aus: ein Alarm feuert genau auf
// dem Poll, an dem die konfigurierte Verzögerung erstmals überschritten wird
// ("Crossing Window", Breite = ein Poll-Intervall). Eine Recovery-Nachricht
// ist nur zulässig, wenn die zu Ende gegangene Episode lang genug war, dass
// der Alarm selbst ausgelöst worden wäre.

export function shouldFireDelayedAlert(
  since: Date | null,
  delayMin: number,
  pollIntervalSec: number
): boolean {
  if (!since) return false;
  const delayMs = Math.max(0, delayMin) * 60_000;
  if (delayMs === 0) return true;

  const elapsedMs = Date.now() - since.getTime();
  const pollMs = Math.max(1000, pollIntervalSec * 1000);
  return elapsedMs >= delayMs && elapsedMs - pollMs < delayMs;
}

export function shouldFireRecovery(
  sinceBeforeClear: Date | null,
  delayMin: number
): boolean {
  if (!sinceBeforeClear) return false;
  const delayMs = Math.max(0, delayMin) * 60_000;
  const durationMs = Date.now() - sinceBeforeClear.getTime();
  return durationMs >= delayMs;
}
