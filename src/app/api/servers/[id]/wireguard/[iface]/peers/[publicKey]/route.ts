import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireWireguardEnabled, handleApiError, ApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { execOnServer } from "@/lib/ssh";
import {
  validateIfaceName,
  readAndParseConfig,
  serializeWgConfig,
  buildWriteConfigCommand,
  buildSyncCommand,
} from "@/lib/wireguard";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; iface: string; publicKey: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { id, iface, publicKey } = await params;
    validateIfaceName(iface);
    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    requireWireguardEnabled(server);

    const decodedKey = decodeURIComponent(publicKey);
    const config = await readAndParseConfig(server, iface);
    const before = config.peers.length;
    const removed = config.peers.find((p) => p.publicKey === decodedKey);
    config.peers = config.peers.filter((p) => p.publicKey !== decodedKey);
    if (config.peers.length === before) {
      throw new ApiError(404, "Peer nicht gefunden");
    }

    const raw = serializeWgConfig(config);
    const { command, stdin } = buildWriteConfigCommand(server, iface, raw);
    const writeRes = await execOnServer(server, command, 15_000, stdin);
    if (writeRes.code !== 0) {
      throw new ApiError(500, writeRes.stderr.trim() || "Peer konnte nicht entfernt werden");
    }
    const syncCmd = buildSyncCommand(server, iface);
    await execOnServer(server, syncCmd.command, 10_000, syncCmd.stdin);

    await writeAuditLog(session, "wireguard.peer.remove", {
      serverId: id,
      detail: `Peer '${removed?.name ?? decodedKey.slice(0, 12)}' von Interface ${iface} entfernt`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
