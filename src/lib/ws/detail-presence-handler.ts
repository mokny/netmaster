import type { WebSocket } from "ws";
import {
  subscribeFastProxmoxPoll,
  unsubscribeFastProxmoxPoll,
  subscribeFastDockerPoll,
  unsubscribeFastDockerPoll,
} from "@/lib/monitor/scheduler";

export type DetailPresenceKind = "proxmox" | "docker";

// Reiner Präsenz-Socket ohne eigenes Nachrichtenprotokoll: Solange die
// Verbindung offen ist, läuft für den zugehörigen Server ein schnelles
// Poll-Intervall (siehe scheduler.ts subscribeFastProxmoxPoll/-DockerPoll).
// Die eigentlichen Daten kommen weiterhin über den bestehenden
// `/api/ws`-Firehose (monitorEvents) - dieser Socket dient nur dazu, dem
// Scheduler mitzuteilen, dass gerade jemand hinschaut.
export function handleDetailPresenceSocket(ws: WebSocket, serverId: string, kind: DetailPresenceKind) {
  if (kind === "proxmox") subscribeFastProxmoxPoll(serverId);
  else subscribeFastDockerPoll(serverId);

  const unsubscribe = () => {
    if (kind === "proxmox") unsubscribeFastProxmoxPoll(serverId);
    else unsubscribeFastDockerPoll(serverId);
  };

  ws.on("close", unsubscribe);
  ws.on("error", unsubscribe);
}
