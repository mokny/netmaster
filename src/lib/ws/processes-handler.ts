import type { WebSocket } from "ws";
import type { Client } from "ssh2";
import { prisma } from "@/lib/prisma";
import { connectSsh, execOnConnection, PROCESS_LIST_COMMAND } from "@/lib/ssh";
import { parseProcessListOutput } from "@/lib/monitor/processes";
import { getCachedPollingSettings } from "@/lib/monitor/polling-settings";

const POLL_INTERVAL_MS = 2500;

// Live-Prozessliste über WebSocket, solange der Client verbunden ist (kein
// Hintergrund-Polling im Scheduler nötig).
//
// Nutzt eine einzige langlebige SSH-Verbindung für die gesamte Dauer der
// WebSocket-Session statt pro Poll-Tick neu zu verbinden: Ein kompletter
// SSH-Handshake + Auth alle 2,5s (Crypto, PAM, sshd-Fork) ist auf schwachen
// Servern deutlich teurer als der eigentliche `ps`-Aufruf und kann dort zu
// spürbaren CPU-Spitzen führen.
export async function handleProcessesSocket(ws: WebSocket, serverId: string) {
  const send = (obj: Record<string, unknown>) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };

  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) {
    send({ type: "error", message: "Server nicht gefunden" });
    ws.close();
    return;
  }

  let stopped = false;
  let inFlight = false;
  let conn: Client | null = null;

  const closeConn = () => {
    conn?.end();
    conn = null;
  };

  async function poll() {
    if (stopped || inFlight) return;
    // Globaler Debug-Schalter (Admin > Einstellungen > Polling) - Intervall
    // bleibt bestehen, damit die Prozessliste ohne Reconnect sofort wieder
    // anläuft, sobald der Schalter zurückgestellt wird.
    const settings = getCachedPollingSettings();
    if (settings && !settings.wsProcessesEnabled) return;
    inFlight = true;
    try {
      if (!conn) {
        const current = await prisma.server.findUnique({ where: { id: serverId } });
        if (!current) return;
        conn = await connectSsh(current);
        conn.on("close", () => {
          conn = null;
        });
        conn.on("error", () => {
          closeConn();
        });
      }
      const result = await execOnConnection(conn, PROCESS_LIST_COMMAND, 8_000);
      const processes = parseProcessListOutput(result.stdout);
      send({ type: "processes", processes });
    } catch (err) {
      closeConn();
      send({
        type: "error",
        message: err instanceof Error ? err.message : "Abfrage fehlgeschlagen",
      });
    } finally {
      inFlight = false;
    }
  }

  void poll();
  const timer = setInterval(poll, POLL_INTERVAL_MS);

  ws.on("close", () => {
    stopped = true;
    clearInterval(timer);
    closeConn();
  });
  ws.on("error", () => {
    stopped = true;
    clearInterval(timer);
    closeConn();
  });
}
