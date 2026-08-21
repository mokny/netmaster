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
  type WgPeer,
} from "@/lib/wireguard";

interface LinkBody {
  peerServerId: string;
  peerIface: string;
  thisAllowedIps: string; // AllowedIPs, wie sie beim anderen Server für DIESEN Server eingetragen werden
  peerAllowedIps: string; // AllowedIPs, wie sie bei DIESEM Server für den anderen Server eingetragen werden
  persistentKeepalive?: number;
  thisEndpoint?: string;
  peerEndpoint?: string;
}

async function derivePublicKey(server: Awaited<ReturnType<typeof prisma.server.findUniqueOrThrow>>, privateKey: string) {
  const res = await execOnServer(server, "wg pubkey", 10_000, `${privateKey}\n`);
  return res.stdout.trim();
}

// Verknüpft zwei von netmaster verwaltete Server als gegenseitige
// WireGuard-Peers: liest beide Interface-Configs, trägt auf jeder Seite
// einen Peer-Eintrag mit dem PublicKey/Endpoint der jeweils anderen Seite
// ein und schreibt beide Dateien zurück.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; iface: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { id, iface } = await params;
    validateIfaceName(iface);
    const body = (await req.json()) as LinkBody;
    validateIfaceName(body.peerIface);
    if (!body.thisAllowedIps?.trim() || !body.peerAllowedIps?.trim()) {
      throw new ApiError(400, "AllowedIPs sind für beide Seiten erforderlich");
    }
    if (body.peerServerId === id && body.peerIface === iface) {
      throw new ApiError(400, "Ein Interface kann nicht mit sich selbst verknüpft werden");
    }

    const [thisServer, peerServer] = await Promise.all([
      prisma.server.findUniqueOrThrow({ where: { id } }),
      prisma.server.findUniqueOrThrow({ where: { id: body.peerServerId } }),
    ]);
    requireWireguardEnabled(thisServer);
    requireWireguardEnabled(peerServer);

    const [thisConfig, peerConfig] = await Promise.all([
      readAndParseConfig(thisServer, iface),
      readAndParseConfig(peerServer, body.peerIface),
    ]);
    if (!thisConfig.privateKey || !peerConfig.privateKey) {
      throw new ApiError(500, "Eines der Interfaces hat keinen PrivateKey");
    }

    const [thisPublicKey, peerPublicKey] = await Promise.all([
      derivePublicKey(thisServer, thisConfig.privateKey),
      derivePublicKey(peerServer, peerConfig.privateKey),
    ]);

    const thisEndpoint = body.thisEndpoint?.trim() || `${thisServer.hostname}:${thisConfig.listenPort ?? 51820}`;
    const peerEndpoint = body.peerEndpoint?.trim() || `${peerServer.hostname}:${peerConfig.listenPort ?? 51820}`;

    const newPeerOnThis: WgPeer = {
      name: `${peerServer.name} (${body.peerIface})`,
      publicKey: peerPublicKey,
      allowedIps: body.peerAllowedIps.trim(),
      endpoint: peerEndpoint,
      persistentKeepalive: body.persistentKeepalive || undefined,
    };
    const newPeerOnPeer: WgPeer = {
      name: `${thisServer.name} (${iface})`,
      publicKey: thisPublicKey,
      allowedIps: body.thisAllowedIps.trim(),
      endpoint: thisEndpoint,
      persistentKeepalive: body.persistentKeepalive || undefined,
    };

    thisConfig.peers = thisConfig.peers.filter((p) => p.publicKey !== peerPublicKey);
    thisConfig.peers.push(newPeerOnThis);
    peerConfig.peers = peerConfig.peers.filter((p) => p.publicKey !== thisPublicKey);
    peerConfig.peers.push(newPeerOnPeer);

    const thisWrite = buildWriteConfigCommand(thisServer, iface, serializeWgConfig(thisConfig));
    const thisRes = await execOnServer(thisServer, thisWrite.command, 15_000, thisWrite.stdin);
    if (thisRes.code !== 0) {
      throw new ApiError(400, thisRes.stderr.trim() || "Konnte lokale Config nicht schreiben");
    }
    const peerWrite = buildWriteConfigCommand(peerServer, body.peerIface, serializeWgConfig(peerConfig));
    const peerRes = await execOnServer(peerServer, peerWrite.command, 15_000, peerWrite.stdin);
    if (peerRes.code !== 0) {
      throw new ApiError(400, peerRes.stderr.trim() || "Konnte Config des anderen Servers nicht schreiben");
    }

    const thisSync = buildSyncCommand(thisServer, iface);
    await execOnServer(thisServer, thisSync.command, 10_000, thisSync.stdin);
    const peerSync = buildSyncCommand(peerServer, body.peerIface);
    await execOnServer(peerServer, peerSync.command, 10_000, peerSync.stdin);

    await writeAuditLog(session, "wireguard.peer.link-server", {
      serverId: id,
      detail: `Verknüpft mit ${peerServer.name}/${body.peerIface}`,
    });
    await writeAuditLog(session, "wireguard.peer.link-server", {
      serverId: body.peerServerId,
      detail: `Verknüpft mit ${thisServer.name}/${iface}`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
