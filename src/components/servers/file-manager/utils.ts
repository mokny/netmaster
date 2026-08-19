export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function modeToOctal(mode: number): string {
  return (mode & 0o777).toString(8).padStart(3, "0");
}

export function modeToRwx(mode: number): string {
  const perms = mode & 0o777;
  const chars = "rwx";
  let out = "";
  for (let shift = 6; shift >= 0; shift -= 3) {
    const bits = (perms >> shift) & 0o7;
    for (let i = 0; i < 3; i++) {
      out += bits & (1 << (2 - i)) ? chars[i] : "-";
    }
  }
  return out;
}

export function joinPath(dir: string, name: string): string {
  return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

export function parentPath(dir: string): string {
  if (dir === "/") return "/";
  const trimmed = dir.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx <= 0 ? "/" : trimmed.slice(0, idx);
}

// Erkennt Textdateien anhand der Endung – rein heuristisch für die
// Doppelklick-Entscheidung "Editor vs. Download"; die eigentliche
// Binär-/Größenprüfung passiert serverseitig beim Lesen.
const LIKELY_BINARY_EXT = new Set([
  "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp", "svg",
  "zip", "tar", "gz", "bz2", "xz", "7z", "rar",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "mp3", "mp4", "avi", "mov", "mkv", "wav", "flac",
  "so", "bin", "exe", "dll", "o", "a",
]);

export function looksLikeBinaryName(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return LIKELY_BINARY_EXT.has(ext);
}
