import type { WebSocket } from "ws";
import { prisma } from "@/lib/prisma";
import { openVmTerminalSession, type VmType } from "@/lib/ssh";
import { writeAuditLog } from "@/lib/audit";
import type { SessionPayload } from "@/lib/session-token";

interface ResizeMessage {
  type: "resize";
  cols: number;
  rows: number;
}

// Wie terminal-handler.ts, aber statt einer Login-Shell wird direkt die
// Proxmox-VM/LXC-Konsole ('pct enter'/'qm terminal') angehängt.
export async function handleVmTerminalSocket(
  ws: WebSocket,
  serverId: string,
  vmid: number,
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

  const vm = await prisma.proxmoxVm.findUnique({
    where: { serverId_vmid: { serverId, vmid } },
  });
  if (!vm) {
    send({ type: "error", message: "VM nicht gefunden" });
    ws.close();
    return;
  }

  const type: VmType = vm.type === "QEMU" ? "qemu" : "lxc";

  let shell: Awaited<ReturnType<typeof openVmTerminalSession>> | null = null;
  try {
    shell = await openVmTerminalSession(server, type, vmid, { cols: 80, rows: 24 });
  } catch (err) {
    send({
      type: "error",
      message: err instanceof Error ? err.message : "SSH-Verbindung fehlgeschlagen",
    });
    ws.close();
    return;
  }

  const { conn, stream } = shell;
  void writeAuditLog(session, "vm.terminal.open", {
    serverId,
    detail: `vmid=${vmid} name=${vm.name}`,
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
    void writeAuditLog(session, "vm.terminal.close", {
      serverId,
      detail: `vmid=${vmid} name=${vm.name}`,
    });
    stream.end();
    conn.end();
  };
  ws.on("close", cleanup);
  ws.on("error", cleanup);
}
