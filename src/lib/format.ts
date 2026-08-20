// Formatiert eine Bit/s-Rate dynamisch auf die passende Einheit (Kbit/Mbit/Gbit).
export function formatBitRate(bytesPerSecond: number | null): string {
  if (bytesPerSecond === null || Number.isNaN(bytesPerSecond)) return "–";
  const bits = Math.max(0, bytesPerSecond) * 8;
  const units = ["bit/s", "Kbit/s", "Mbit/s", "Gbit/s", "Tbit/s"];
  let value = bits;
  let unitIndex = 0;
  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex++;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

// Formatiert eine kumulative Byte-Menge in GB (bzw. kleiner/größer skaliert).
export function formatBytesGB(bytes: number | null): string {
  if (bytes === null || Number.isNaN(bytes)) return "–";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.max(0, bytes);
  let unitIndex = 0;
  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex++;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}
