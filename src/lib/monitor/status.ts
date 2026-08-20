import type { Server as ServerModel } from "@/generated/prisma/client";
import type { ParsedMetrics } from "./parse";

export type StatusValue = "UNKNOWN" | "OK" | "WARNING" | "CRITICAL";
export type MetricKey = "cpu" | "mem" | "disk" | "net";

export interface ServerStatusResult {
  overall: StatusValue;
  metrics: Record<MetricKey, StatusValue>;
}

function worse(a: StatusValue, b: StatusValue): StatusValue {
  const rank: Record<StatusValue, number> = {
    UNKNOWN: 0,
    OK: 1,
    WARNING: 2,
    CRITICAL: 3,
  };
  return rank[a] >= rank[b] ? a : b;
}

function levelFor(value: number | null, warn: number, crit: number): StatusValue {
  if (value === null) return "UNKNOWN";
  if (value >= crit) return "CRITICAL";
  if (value >= warn) return "WARNING";
  return "OK";
}

// Aktuelle Durchsatz-Rate in Mbit/s (aus Delta zweier kumulativer Byte-Zähler
// berechnet, siehe collect.ts) - separat von ParsedMetrics, da sie nicht aus
// einem einzelnen Poll ableitbar ist, sondern den vorherigen Sample benötigt.
export interface NetRates {
  uploadMbit: number | null;
  downloadMbit: number | null;
}

export function computeServerStatus(
  server: Pick<
    ServerModel,
    | "cpuWarn"
    | "cpuCrit"
    | "memWarn"
    | "memCrit"
    | "diskWarn"
    | "diskCrit"
    | "netUploadWarn"
    | "netUploadCrit"
    | "netDownloadWarn"
    | "netDownloadCrit"
  >,
  metrics: ParsedMetrics,
  netRates: NetRates
): ServerStatusResult {
  const cpu = levelFor(metrics.cpuPercent, server.cpuWarn, server.cpuCrit);
  const mem = levelFor(metrics.memPercent, server.memWarn, server.memCrit);
  const disk = levelFor(metrics.diskPercent, server.diskWarn, server.diskCrit);
  const upload = levelFor(netRates.uploadMbit, server.netUploadWarn, server.netUploadCrit);
  const download = levelFor(
    netRates.downloadMbit,
    server.netDownloadWarn,
    server.netDownloadCrit
  );
  const net = worse(upload, download);

  let overall: StatusValue = "OK";
  for (const s of [cpu, mem, disk, net]) {
    if (s === "UNKNOWN") continue;
    overall = worse(overall, s);
  }

  return { overall, metrics: { cpu, mem, disk, net } };
}
