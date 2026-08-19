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
  | { type: "service-check"; serviceCheckId: string; serverId: string; status: string }
  | { type: "docker"; serverId: string; containers: unknown[] }
  | { type: "proxmox"; serverId: string; vms: unknown[] };

export function publish(event: MonitorEvent) {
  monitorEvents.emit("event", event);
}
