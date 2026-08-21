import type { WebSocket } from "ws";
import { openAdhocShellSession } from "@/lib/ssh";
import { consumeAdhocSshTicket } from "@/lib/adhoc-ssh-tickets";
import { writeAuditLog } from "@/lib/audit";
import type { SessionPayload } from "@/lib/session-token";

interface ResizeMessage {
  type: "resize";
  cols: number;
  rows: number;
}

// Wie terminal-handler.ts, aber für Ad-hoc-Verbindungen zu Explore-Hosts
// ohne Server-Eintrag: die Zugangsdaten kommen aus einem Einmal-Ticket
// (siehe adhoc-ssh-tickets.ts) statt aus der DB.
export async function handleAdhocTerminalSocket(
  ws: WebSocket,
  ticket: string,
  session: SessionPayload
) {
  const send = (obj: Record<string, unknown>) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };

  const creds = consumeAdhocSshTicket(ticket);
  if (!creds) {
    send({ type: "error", message: "Connection ticket invalid or expired" });
    ws.close();
    return;
  }

  const detail = `${creds.username}@${creds.host}:${creds.port} (ad-hoc)`;

  let shell: Awaited<ReturnType<typeof openAdhocShellSession>> | null = null;
  try {
    shell = await openAdhocShellSession(creds, { cols: 80, rows: 24 });
  } catch (err) {
    send({
      type: "error",
      message: err instanceof Error ? err.message : "SSH-Verbindung fehlgeschlagen",
    });
    ws.close();
    return;
  }

  const { conn, stream } = shell;
  void writeAuditLog(session, "terminal.open", { detail });
  send({ type: "connected" });

  stream.on("data", (data: Buffer) => {
    if (ws.readyState === ws.OPEN) ws.send(data, { binary: true });
  });
  stream.stderr.on("data", (data: Buffer) => {
    if (ws.readyState === ws.OPEN) ws.send(data, { binary: true });
  });
  stream.on("close", () => {
    send({ type: "closed" });
    ws.close();
  });
  conn.on("error", (err) => {
    send({ type: "error", message: err.message });
  });

  ws.on("message", (data, isBinary) => {
    if (isBinary) {
      stream.write(data as Buffer);
      return;
    }
    try {
      const msg = JSON.parse(data.toString("utf8")) as ResizeMessage;
      if (msg.type === "resize" && msg.cols > 0 && msg.rows > 0) {
        stream.setWindow(msg.rows, msg.cols, 0, 0);
      }
    } catch {
      // ignore malformed control messages
    }
  });

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    void writeAuditLog(session, "terminal.close", { detail });
    stream.end();
    conn.end();
  };
  ws.on("close", cleanup);
  ws.on("error", cleanup);
}
