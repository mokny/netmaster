import { EventEmitter } from "events";

// Prozessweiter Event-Bus: Der Poll-Scheduler (server.ts) schreibt Events hierher,
// der WebSocket-Server abonniert sie und pusht sie an verbundene Clients.
export const monitorEvents = new EventEmitter();
monitorEvents.setMaxListeners(50);

export type MonitorEvent =
  | {
      type: "metric";
      serverId: string;
      sample: Record<string, unknown>;
      disks?: Record<string, unknown>[];
    }
  | { type: "server-status"; serverId: string; status: string; error?: string | null }
  | { type: "service-check"; serviceCheckId: string; serverId: string | null; status: string }
  | { type: "docker"; serverId: string; containers: unknown[] }
  | { type: "docker-images"; serverId: string; images: unknown[] }
  | { type: "proxmox"; serverId: string; vms: unknown[] }
  | { type: "router-device"; routerDeviceId: string; status: string }
  | {
      type: "explore-scan";
      status: "idle" | "running" | "error";
      startedAt: string | null;
      progress: { phase: "hosts" | "ports"; current: number; total: number } | null;
      error: string | null;
      lastCompletedAt: string | null;
    }
  | { type: "explore-hosts" }
  | { type: "explore-ranges" }
  | { type: "polling-settings"; settings: Record<string, unknown> };

export function publish(event: MonitorEvent) {
  monitorEvents.emit("event", event);
}
