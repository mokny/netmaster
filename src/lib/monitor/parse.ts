export interface ParsedDisk {
  device: string;
  mountpoint: string;
  totalKb: number | null;
  usedKb: number | null;
  percent: number | null;
}

export interface ParsedMetrics {
  cpuPercent: number | null;
  memPercent: number | null;
  diskPercent: number | null;
  disks: ParsedDisk[];
  loadAvg1: number | null;
  netRxBytes: number | null;
  netTxBytes: number | null;
}

function section(raw: string, name: string): string[] {
  const marker = `__${name}__`;
  const parts = raw.split(marker);
  if (parts.length < 2) return [];
  const rest = parts[1];
  const next = rest.indexOf("__");
  const body = next >= 0 ? rest.slice(0, next) : rest;
  return body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function parseCpuLine(line: string): number[] | null {
  // "cpu  user nice system idle iowait irq softirq steal ..."
  const parts = line.trim().split(/\s+/).slice(1).map(Number);
  if (parts.some(Number.isNaN)) return null;
  return parts;
}

export function parseMetricsOutput(raw: string): ParsedMetrics {
  const result: ParsedMetrics = {
    cpuPercent: null,
    memPercent: null,
    diskPercent: null,
    disks: [],
    loadAvg1: null,
    netRxBytes: null,
    netTxBytes: null,
  };

  try {
    const cpuLines = section(raw, "CPU");
    if (cpuLines.length >= 2) {
      const a = parseCpuLine(cpuLines[0]);
      const b = parseCpuLine(cpuLines[1]);
      if (a && b) {
        const idleA = a[3] + a[4];
        const idleB = b[3] + b[4];
        const totalA = a.reduce((s, v) => s + v, 0);
        const totalB = b.reduce((s, v) => s + v, 0);
        const totalDelta = totalB - totalA;
        const idleDelta = idleB - idleA;
        result.cpuPercent =
          totalDelta > 0
            ? Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100))
            : 0;
      }
    }
  } catch {
    // ignore
  }

  try {
    const memLines = section(raw, "MEM");
    const total = memLines
      .find((l) => l.startsWith("MemTotal"))
      ?.match(/(\d+)/)?.[1];
    const avail = memLines
      .find((l) => l.startsWith("MemAvailable"))
      ?.match(/(\d+)/)?.[1];
    if (total && avail) {
      const t = Number(total);
      const a = Number(avail);
      result.memPercent = t > 0 ? ((t - a) / t) * 100 : null;
    }
  } catch {
    // ignore
  }

  try {
    const diskLines = section(raw, "DISK");
    // Filesystem 1024-blocks Used Available Capacity% Mounted
    for (const line of diskLines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 6) continue;
      const [device, totalStr, usedStr, , pctStr, ...mountParts] = parts;
      const mountpoint = mountParts.join(" ");
      const pct = pctStr?.replace("%", "");
      result.disks.push({
        device,
        mountpoint,
        totalKb: Number.isNaN(Number(totalStr)) ? null : Number(totalStr),
        usedKb: Number.isNaN(Number(usedStr)) ? null : Number(usedStr),
        percent: pct && !Number.isNaN(Number(pct)) ? Number(pct) : null,
      });
    }
    const root = result.disks.find((d) => d.mountpoint === "/");
    result.diskPercent = (root ?? result.disks[0])?.percent ?? null;
  } catch {
    // ignore
  }

  try {
    const loadLines = section(raw, "LOAD");
    if (loadLines.length >= 1) {
      const first = loadLines[0].trim().split(/\s+/)[0];
      result.loadAvg1 = Number(first);
    }
  } catch {
    // ignore
  }

  try {
    const netLines = section(raw, "NET");
    let rx = 0;
    let tx = 0;
    for (const line of netLines) {
      const [, rest] = line.split(":");
      if (!rest) continue;
      const cols = rest.trim().split(/\s+/).map(Number);
      // rx bytes = cols[0], tx bytes = cols[8]
      if (!Number.isNaN(cols[0])) rx += cols[0];
      if (!Number.isNaN(cols[8])) tx += cols[8];
    }
    result.netRxBytes = rx;
    result.netTxBytes = tx;
  } catch {
    // ignore
  }

  return result;
}

export interface ParsedContainer {
  containerId: string;
  name: string;
  image: string;
  state: string;
  cpuPercent: number | null;
  memUsageMb: number | null;
  netRxMb: number | null;
  netTxMb: number | null;
}

function parseMemUsage(usage: string): number | null {
  // e.g. "12.5MiB / 1.9GiB"
  const first = usage.split("/")[0]?.trim();
  if (!first) return null;
  const match = first.match(/([\d.]+)\s*([a-zA-Z]+)/);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith("gi")) return value * 1024;
  if (unit.startsWith("mi")) return value;
  if (unit.startsWith("ki")) return value / 1024;
  return value;
}

// docker stats NetIO nutzt Dezimal-Einheiten (B/kB/MB/GB), im Gegensatz zu
// MemUsage (binär, MiB/GiB) – daher ein eigener Parser.
function parseNetIoValue(value: string): number | null {
  const match = value.trim().match(/([\d.]+)\s*([a-zA-Z]+)/);
  if (!match) return null;
  const num = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith("g")) return num * 1000;
  if (unit.startsWith("m")) return num;
  if (unit.startsWith("k")) return num / 1000;
  return num / 1_000_000; // Bytes -> MB
}

function parseNetIo(netIo: string): { netRxMb: number | null; netTxMb: number | null } {
  // e.g. "648B / 846B" oder "1.2MB / 3.4MB"
  const [rx, tx] = netIo.split("/");
  return {
    netRxMb: rx ? parseNetIoValue(rx) : null,
    netTxMb: tx ? parseNetIoValue(tx) : null,
  };
}

export function parseDockerOutput(raw: string): ParsedContainer[] {
  const [statsPart, statePart] = raw.split("__STATE__");
  const containers = new Map<string, ParsedContainer>();

  for (const line of (statsPart ?? "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [id, name, cpuPerc, memUsage, netIo] = trimmed.split("|");
    if (!id) continue;
    const { netRxMb, netTxMb } = netIo ? parseNetIo(netIo) : { netRxMb: null, netTxMb: null };
    containers.set(id, {
      containerId: id,
      name: name ?? id,
      image: "",
      state: "running",
      cpuPercent: cpuPerc ? Number(cpuPerc.replace("%", "")) : null,
      memUsageMb: memUsage ? parseMemUsage(memUsage) : null,
      netRxMb,
      netTxMb,
    });
  }

  for (const line of (statePart ?? "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [id, state, image, name] = trimmed.split("|");
    if (!id) continue;
    const existing = containers.get(id);
    if (existing) {
      existing.state = state ?? existing.state;
      existing.image = image ?? existing.image;
    } else {
      containers.set(id, {
        containerId: id,
        name: name || id,
        image: image ?? "",
        state: state ?? "unknown",
        cpuPercent: null,
        memUsageMb: null,
        netRxMb: null,
        netTxMb: null,
      });
    }
  }

  return Array.from(containers.values());
}

export interface ParsedImage {
  imageId: string;
  repository: string;
  tag: string;
  sizeMb: number | null;
  createdLabel: string;
}

// docker images Size nutzt Dezimal-Einheiten (B/kB/MB/GB), analog zu NetIO.
function parseImageSize(value: string): number | null {
  return parseNetIoValue(value);
}

export function parseDockerImagesOutput(raw: string): ParsedImage[] {
  const images: ParsedImage[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [id, repository, tag, size, createdSince] = trimmed.split("|");
    if (!id) continue;
    images.push({
      imageId: id,
      repository: repository ?? "<none>",
      tag: tag ?? "<none>",
      sizeMb: size ? parseImageSize(size) : null,
      createdLabel: createdSince ?? "",
    });
  }
  return images;
}

export interface ParsedVm {
  vmid: number;
  type: "qemu" | "lxc";
  name: string;
  status: string;
  cpuPercent: number | null;
  memUsedMb: number | null;
  memTotalMb: number | null;
  diskUsedGb: number | null;
  diskTotalGb: number | null;
}

interface PveClusterResource {
  type?: string;
  vmid?: number;
  name?: string;
  status?: string;
  cpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
}

// Erwartet die JSON-Ausgabe von
// `pvesh get /cluster/resources --type vm --output-format json`.
export function parseProxmoxOutput(raw: string): ParsedVm[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  let entries: PveClusterResource[];
  try {
    entries = JSON.parse(trimmed);
  } catch {
    return [];
  }
  if (!Array.isArray(entries)) return [];

  const vms: ParsedVm[] = [];
  for (const e of entries) {
    if (e.type !== "qemu" && e.type !== "lxc") continue;
    if (typeof e.vmid !== "number") continue;

    const mem = typeof e.mem === "number" ? e.mem : null;
    const maxmem = typeof e.maxmem === "number" ? e.maxmem : null;
    const disk = typeof e.disk === "number" ? e.disk : null;
    const maxdisk = typeof e.maxdisk === "number" ? e.maxdisk : null;

    vms.push({
      vmid: e.vmid,
      type: e.type,
      name: e.name ?? `${e.type}/${e.vmid}`,
      status: e.status ?? "unknown",
      cpuPercent: typeof e.cpu === "number" ? e.cpu * 100 : null,
      memUsedMb: mem !== null ? mem / 1024 / 1024 : null,
      memTotalMb: maxmem !== null ? maxmem / 1024 / 1024 : null,
      diskUsedGb: disk !== null ? disk / 1024 / 1024 / 1024 : null,
      diskTotalGb: maxdisk !== null ? maxdisk / 1024 / 1024 / 1024 : null,
    });
  }
  return vms;
}

export interface ParsedSnapshot {
  name: string;
  description: string;
  timestamp: number | null;
  parent: string | null;
  hasVmstate: boolean;
}

interface PveSnapshotEntry {
  name?: string;
  description?: string;
  snaptime?: number;
  parent?: string;
  vmstate?: number;
}

// Erwartet die JSON-Ausgabe von
// `pvesh get /nodes/{node}/qemu|lxc/{vmid}/snapshot --output-format json`.
export function parseSnapshotListOutput(raw: string): ParsedSnapshot[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  let entries: PveSnapshotEntry[];
  try {
    entries = JSON.parse(trimmed);
  } catch {
    return [];
  }
  if (!Array.isArray(entries)) return [];

  return entries
    .filter((e) => e.name && e.name !== "current")
    .map((e) => ({
      name: e.name!,
      description: e.description ?? "",
      timestamp: typeof e.snaptime === "number" ? e.snaptime * 1000 : null,
      parent: e.parent ?? null,
      hasVmstate: e.vmstate === 1,
    }));
}

export interface ParsedStorage {
  storage: string;
  contentTypes: string[];
}

interface PveStorageEntry {
  storage?: string;
  content?: string;
}

// Erwartet die JSON-Ausgabe von `pvesh get /nodes/{node}/storage`.
export function parseStorageListOutput(raw: string): ParsedStorage[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  let entries: PveStorageEntry[];
  try {
    entries = JSON.parse(trimmed);
  } catch {
    return [];
  }
  if (!Array.isArray(entries)) return [];

  return entries
    .filter((e) => e.storage && e.content)
    .map((e) => ({
      storage: e.storage!,
      contentTypes: e.content!.split(","),
    }))
    .filter((s) => s.contentTypes.includes("backup"));
}

export interface ParsedBackup {
  volid: string;
  storage: string;
  sizeBytes: number | null;
  timestamp: number | null;
  notes: string;
  vmType: "qemu" | "lxc" | null;
}

interface PveContentEntry {
  volid?: string;
  size?: number;
  ctime?: number;
  notes?: string;
  format?: string;
  content?: string;
}

// Erwartet die JSON-Ausgabe von
// `pvesh get /nodes/{node}/storage/{storage}/content --content backup`.
export function parseBackupListOutput(raw: string, storage: string): ParsedBackup[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  let entries: PveContentEntry[];
  try {
    entries = JSON.parse(trimmed);
  } catch {
    return [];
  }
  if (!Array.isArray(entries)) return [];

  return entries
    .filter((e) => e.volid)
    .map((e) => {
      const vmType = e.volid!.includes("vzdump-qemu-")
        ? "qemu"
        : e.volid!.includes("vzdump-lxc-")
          ? "lxc"
          : null;
      return {
        volid: e.volid!,
        storage,
        sizeBytes: typeof e.size === "number" ? e.size : null,
        timestamp: typeof e.ctime === "number" ? e.ctime * 1000 : null,
        notes: e.notes ?? "",
        vmType,
      };
    });
}
