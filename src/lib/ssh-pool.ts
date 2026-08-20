import type { Client } from "ssh2";
import { connectSsh, execOnConnection, type SshExecResult } from "./ssh";
import type { Server as ServerModel } from "@/generated/prisma/client";

// Globaler Pool langlebiger SSH-Verbindungen, eine pro Server-ID, geteilt
// zwischen Scheduler (Metrics/Docker/Proxmox-Polling) und Polling-API-Routen
// (Topologie, Ports). Vermeidet wiederholten Handshake+Auth-Overhead, der bei
// häufigem Polling (Sekunden-Intervalle) CPU-teurer ist als die eigentlichen
// Befehle. SSH-Kanäle sind multiplexbar, mehrere execPooled-Aufrufe auf
// derselben Verbindung laufen also parallel statt sich zu blockieren.
const pool = new Map<string, Promise<Client>>();

function getConnection(server: ServerModel): Promise<Client> {
  const existing = pool.get(server.id);
  if (existing) return existing;

  const promise = connectSsh(server).then((conn) => {
    const forget = () => {
      if (pool.get(server.id) === promise) pool.delete(server.id);
    };
    conn.on("close", forget);
    conn.on("error", forget);
    return conn;
  });
  promise.catch(() => {
    if (pool.get(server.id) === promise) pool.delete(server.id);
  });
  pool.set(server.id, promise);
  return promise;
}

export async function execPooled(
  server: ServerModel,
  command: string,
  timeoutMs = 15_000,
  stdin?: string
): Promise<SshExecResult> {
  const conn = await getConnection(server);
  return execOnConnection(conn, command, timeoutMs, stdin);
}

// Schließt eine gepoolte Verbindung explizit, z. B. wenn sich Zugangsdaten
// oder Hostname geändert haben oder der Server gelöscht wurde – sonst würde
// mit veralteten Credentials weitergearbeitet, bis ein Fehler auftritt.
export function invalidatePooledConnection(serverId: string) {
  const existing = pool.get(serverId);
  if (!existing) return;
  pool.delete(serverId);
  existing.then((conn) => conn.end()).catch(() => {});
}

export function closeAllPooledConnections() {
  for (const serverId of [...pool.keys()]) invalidatePooledConnection(serverId);
}
