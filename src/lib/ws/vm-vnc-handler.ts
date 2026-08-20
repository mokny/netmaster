import type { WebSocket } from "ws";
import { prisma } from "@/lib/prisma";
import { openVmVncSession } from "@/lib/ssh";
import { writeAuditLog } from "@/lib/audit";
import type { SessionPayload } from "@/lib/session-token";

// Anders als terminal-handler.ts: der Socket transportiert ausschließlich
// das rohe RFB/VNC-Binärprotokoll (der noVNC-Client im Browser übernimmt
// den Socket vollständig) – es dürfen keine JSON-Textframes gesendet
// werden, da der Client sie als ungültige VNC-Daten interpretieren würde.
// Fehler vor Verbindungsaufbau werden daher nur durch Schließen des
// Sockets signalisiert.
export async function handleVmVncSocket(
  ws: WebSocket,
  serverId: string,
  vmid: number,
  ticket: string,
  session: SessionPayload
) {
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) {
    ws.close(4404, "Server nicht gefunden");
    return;
  }

  const vm = await prisma.proxmoxVm.findUnique({
    where: { serverId_vmid: { serverId, vmid } },
  });
  if (!vm || vm.type !== "QEMU") {
    ws.close(4404, "QEMU-VM nicht gefunden");
    return;
  }

  let shell: Awaited<ReturnType<typeof openVmVncSession>> | null = null;
  try {
    shell = await openVmVncSession(server, vmid, ticket);
  } catch {
    ws.close(4502, "SSH-Verbindung fehlgeschlagen");
    return;
  }

  const { conn, stream } = shell;
  void writeAuditLog(session, "vm.vnc.open", {
    serverId,
    detail: `vmid=${vmid} name=${vm.name}`,
  });

  stream.on("data", (data: Buffer) => {
    if (ws.readyState === ws.OPEN) ws.send(data, { binary: true });
  });
  stream.on("close", () => ws.close());
  conn.on("error", () => ws.close());

  ws.on("message", (data, isBinary) => {
    if (isBinary) stream.write(data as Buffer);
  });

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    void writeAuditLog(session, "vm.vnc.close", {
      serverId,
      detail: `vmid=${vmid} name=${vm.name}`,
    });
    stream.end();
    conn.end();
  };
  ws.on("close", cleanup);
  ws.on("error", cleanup);
}
