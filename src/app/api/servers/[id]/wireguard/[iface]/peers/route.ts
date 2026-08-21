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
  generateKeypair,
  generatePresharedKey,
  buildPeerClientConfig,
  type WgPeer,
} from "@/lib/wireguard";

interface AddPeerBody {
  name: string;
  allowedIps: string;
  endpoint?: string;
  persistentKeepalive?: number;
  usePsk?: boolean;
  clientAddress: string;
  clientDns?: string;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; iface: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { id, iface } = await params;
    validateIfaceName(iface);
    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    requireWireguardEnabled(server);

    const body = (await req.json()) as AddPeerBody;
    if (!body.name?.trim()) throw new ApiError(400, "Name ist erforderlich");
    if (!body.allowedIps?.trim()) throw new ApiError(400, "AllowedIPs ist erforderlich");
    if (!body.clientAddress?.trim()) throw new ApiError(400, "Client-Adresse ist erforderlich");

    const config = await readAndParseConfig(server, iface);
    if (!config.privateKey) throw new ApiError(500, "Interface hat keinen PrivateKey");

    const pubRes = await execOnServer(server, "wg pubkey", 10_000, `${config.privateKey}\n`);
    const serverPublicKey = pubRes.stdout.trim();
    if (!serverPublicKey) throw new ApiError(500, "Server-PublicKey konnte nicht ermittelt werden");

    const { privateKey: peerPrivateKey, publicKey: peerPublicKey } = await generateKeypair(server);
    const presharedKey = body.usePsk !== false ? await generatePresharedKey(server) : undefined;

    const newPeer: WgPeer = {
      name: body.name.trim(),
      publicKey: peerPublicKey,
      presharedKey,
      allowedIps: body.allowedIps.trim(),
      endpoint: body.endpoint?.trim() || undefined,
      persistentKeepalive: body.persistentKeepalive || undefined,
    };
    config.peers.push(newPeer);

    const raw = serializeWgConfig(config);
    const { command, stdin } = buildWriteConfigCommand(server, iface, raw);
    const writeRes = await execOnServer(server, command, 15_000, stdin);
    if (writeRes.code !== 0) {
      throw new ApiError(400, writeRes.stderr.trim() || "Peer konnte nicht gespeichert werden");
    }
    const syncCmd = buildSyncCommand(server, iface);
    await execOnServer(server, syncCmd.command, 10_000, syncCmd.stdin);

    const peerConfig = buildPeerClientConfig({
      peerPrivateKey,
      peerAddress: body.clientAddress.trim(),
      dns: body.clientDns?.trim() || undefined,
      serverPublicKey,
      serverEndpoint: `${server.hostname}:${config.listenPort ?? 51820}`,
      allowedIps: "0.0.0.0/0, ::/0",
      presharedKey,
      persistentKeepalive: body.persistentKeepalive || undefined,
    });

    await writeAuditLog(session, "wireguard.peer.add", {
      serverId: id,
      detail: `Peer '${newPeer.name}' zu Interface ${iface} hinzugefügt`,
    });

    return NextResponse.json({ ok: true, peerConfig, publicKey: peerPublicKey });
  } catch (err) {
    return handleApiError(err);
  }
}
