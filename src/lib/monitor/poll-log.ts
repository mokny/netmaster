import { prisma } from "@/lib/prisma";

// Reihenfolge/Werte hier sind der einzige Ort, der die Poll-Typen für die
// Debug-Ansicht (admin/debug/[serverId]) definiert - siehe schema.prisma
// PollLog. Feste 2-Tage-Aufbewahrung, unabhängig von server.retentionDays
// (siehe Pruning in collect.ts).
export const POLL_LOG_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;

export type PollType =
  | "host_metrics"
  | "docker_containers"
  | "docker_images"
  | "proxmox_vms"
  | "ping"
  | "on_demand";

// Best-effort - ein fehlgeschlagener Log-Write darf den eigentlichen Poll
// nicht kaputt machen (z.B. wenn der Server zwischen collectX() und hier
// gelöscht wurde).
export function logPoll(serverId: string, pollType: PollType, success: boolean) {
  void prisma.pollLog.create({ data: { serverId, pollType, success } }).catch(() => {});
}
