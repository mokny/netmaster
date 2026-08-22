// Duplizierte Konstanten statt Import aus dem Client-Hook
// (use-chart-time-window.ts) - dieses Modul läuft serverseitig in
// Route-Handlern und soll keine "use client"-Grenze ziehen.
const MIN_WINDOW_MS = 5 * 60 * 1000;
const MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const TARGET_POINTS = 300;

// Löst hours (Legacy-Shortcut, endet immer "jetzt") oder from/to (Epoch-ms,
// für Pan in die Vergangenheit) zu einem geclampten Zeitfenster auf - siehe
// useChartTimeWindow auf der Client-Seite, dessen from/to hier ankommen.
// Geclampt auf [5min, min(30 Tage, retentionDays)] und nie über "jetzt" hinaus.
export function resolveTimeRange(
  searchParams: URLSearchParams,
  retentionDays: number
): { from: Date; to: Date } {
  const now = Date.now();
  const maxWindowMs = Math.min(MAX_WINDOW_MS, Math.max(1, retentionDays) * 24 * 60 * 60 * 1000);

  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  let toMs: number;
  let fromMs: number;
  if (fromParam !== null && toParam !== null) {
    toMs = Math.min(now, Number(toParam) || now);
    fromMs = Number(fromParam) || toMs - maxWindowMs;
  } else {
    const hours = Math.min(24 * 30, Math.max(1, Number(searchParams.get("hours") ?? 6)));
    toMs = now;
    fromMs = now - hours * 60 * 60 * 1000;
  }

  let windowMs = toMs - fromMs;
  windowMs = Math.min(maxWindowMs, Math.max(MIN_WINDOW_MS, windowMs));
  fromMs = toMs - windowMs;

  return { from: new Date(fromMs), to: new Date(toMs) };
}

// Bucketet Rohzeilen zu ~targetPoints Punkten (Bucket-Breite =
// Fensterbreite/targetPoints), mittelt die angegebenen numerischen Felder pro
// Bucket. Nicht-numerische Felder (id, name, state, ...) kommen unverändert
// von der jeweils letzten Zeile im Bucket, nur timestamp wird zum
// Bucket-Durchschnitt. Ist die Rohzahl bereits <= targetPoints, wird
// ungebuckett zurückgegeben.
export function downsampleRows<T extends { timestamp: Date }>(
  rows: T[],
  from: Date,
  to: Date,
  averageKeys: (keyof T)[],
  targetPoints = TARGET_POINTS
): T[] {
  if (rows.length <= targetPoints) return rows;

  const spanMs = Math.max(1, to.getTime() - from.getTime());
  const bucketMs = Math.max(1000, spanMs / targetPoints);
  const buckets = new Map<number, T[]>();
  for (const row of rows) {
    const idx = Math.floor((row.timestamp.getTime() - from.getTime()) / bucketMs);
    const bucket = buckets.get(idx);
    if (bucket) bucket.push(row);
    else buckets.set(idx, [row]);
  }

  const indices = Array.from(buckets.keys()).sort((a, b) => a - b);
  return indices.map((idx) => {
    const bucketRows = buckets.get(idx)!;
    const last = bucketRows[bucketRows.length - 1];
    const avgTimestamp =
      bucketRows.reduce((sum, r) => sum + r.timestamp.getTime(), 0) / bucketRows.length;
    const point = { ...last, timestamp: new Date(avgTimestamp) } as T;
    for (const key of averageKeys) {
      const values = bucketRows
        .map((r) => r[key])
        .filter((v): v is number & T[keyof T] => typeof v === "number");
      (point as Record<string, unknown>)[key as string] =
        values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
    }
    return point;
  });
}
