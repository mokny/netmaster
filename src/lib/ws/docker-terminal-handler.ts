import type { WebSocket } from "ws";
import { prisma } from "@/lib/prisma";
import { openDockerExecSession } from "@/lib/ssh";
import { writeAuditLog } from "@/lib/audit";
import type { SessionPayload } from "@/lib/session-token";

interface ResizeMessage {
  type: "resize";
  cols: number;
  rows: number;
}

// Wie terminal-handler.ts, aber statt einer Login-Shell wird direkt
// 'docker exec' in den Ziel-Container angehängt.
export async function handleDockerTerminalSocket(
  ws: WebSocket,
  serverId: string,
  containerId: string,
  session: SessionPayload
) {
  const send = (obj: Record<string, unknown>) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };

  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) {
    send({ type: "error", message: "Server nicht gefunden" });
    ws.close();
    return;
  }
  if (!server.dockerEnabled) {
    send({ type: "error", message: "Docker ist für diesen Server nicht aktiviert" });
    ws.close();
    return;
  }

  let shell: Awaited<ReturnType<typeof openDockerExecSession>> | null = null;
  try {
    shell = await openDockerExecSession(server, containerId, { cols: 80, rows: 24 });
  } catch (err) {
    send({
      type: "error",
      message: err instanceof Error ? err.message : "SSH-Verbindung fehlgeschlagen",
    });
    ws.close();
    return;
  }

  const { conn, stream } = shell;
  void writeAuditLog(session, "docker.terminal.open", {
    serverId,
    detail: `containerId=${containerId}`,
  });
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
    void writeAuditLog(session, "docker.terminal.close", {
      serverId,
      detail: `containerId=${containerId}`,
    });
    stream.end();
    conn.end();
  };
  ws.on("close", cleanup);
  ws.on("error", cleanup);
}
