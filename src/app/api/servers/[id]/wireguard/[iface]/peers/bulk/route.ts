import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
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

interface BulkPeerSpec {
  name: string;
  allowedIps: string;
  clientAddress: string;
  endpoint?: string;
  persistentKeepalive?: number;
  usePsk?: boolean;
  clientDns?: string;
}

// Legt mehrere Peers in einem Rutsch an (z.B. für einen Geräte-Rollout) und
// liefert direkt ein ZIP mit allen fertigen Client-Configs zurück - danach
// sind die privaten Schlüssel nur noch auf dem jeweiligen Gerät vorhanden,
// nicht mehr abrufbar (siehe [iface]/peers/route.ts: Private Keys werden nie
// persistiert).
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

    const body = (await req.json()) as { peers: BulkPeerSpec[] };
    if (!Array.isArray(body.peers) || body.peers.length === 0) {
      throw new ApiError(400, "AT_LEAST_ONE_PEER_REQUIRED");
    }
    for (const p of body.peers) {
      if (!p.name?.trim() || !p.allowedIps?.trim() || !p.clientAddress?.trim()) {
        throw new ApiError(400, "PEER_FIELDS_REQUIRED");
      }
    }

    const config = await readAndParseConfig(server, iface);
    if (!config.privateKey) throw new ApiError(500, "INTERFACE_MISSING_PRIVATE_KEY");
    const pubRes = await execOnServer(server, "wg pubkey", 10_000, `${config.privateKey}\n`);
    const serverPublicKey = pubRes.stdout.trim();
    if (!serverPublicKey) throw new ApiError(500, "SERVER_PUBLIC_KEY_UNAVAILABLE");

    const clientConfigs: { name: string; text: string }[] = [];

    for (const spec of body.peers) {
      const { privateKey: peerPrivateKey, publicKey: peerPublicKey } = await generateKeypair(server);
      const presharedKey = spec.usePsk !== false ? await generatePresharedKey(server) : undefined;

      const peer: WgPeer = {
        name: spec.name.trim(),
        publicKey: peerPublicKey,
        presharedKey,
        allowedIps: spec.allowedIps.trim(),
        endpoint: spec.endpoint?.trim() || undefined,
        persistentKeepalive: spec.persistentKeepalive || undefined,
      };
      config.peers.push(peer);

      clientConfigs.push({
        name: spec.name.trim(),
        text: buildPeerClientConfig({
          peerPrivateKey,
          peerAddress: spec.clientAddress.trim(),
          dns: spec.clientDns?.trim() || undefined,
          serverPublicKey,
          serverEndpoint: `${server.hostname}:${config.listenPort ?? 51820}`,
          allowedIps: "0.0.0.0/0, ::/0",
          presharedKey,
          persistentKeepalive: spec.persistentKeepalive || undefined,
        }),
      });
    }

    const raw = serializeWgConfig(config);
    const { command, stdin } = buildWriteConfigCommand(server, iface, raw);
    const writeRes = await execOnServer(server, command, 20_000, stdin);
    if (writeRes.code !== 0) {
      throw new ApiError(400, "PEERS_SAVE_FAILED", writeRes.stderr.trim() || undefined);
    }
    const syncCmd = buildSyncCommand(server, iface);
    await execOnServer(server, syncCmd.command, 10_000, syncCmd.stdin);

    await writeAuditLog(session, "wireguard.peer.bulk-add", {
      serverId: id,
      detail: `${clientConfigs.length} Peer(s) zu Interface ${iface} hinzugefügt`,
    });

    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.on("warning", (err: Error) => console.error("Zip-Warnung:", err));
    archive.on("error", (err: Error) => console.error("Zip-Fehler:", err));

    void (async () => {
      for (const cfg of clientConfigs) {
        const safeName = cfg.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
        archive.append(cfg.text, { name: `${safeName}.conf` });
      }
      void archive.finalize();
    })();

    const webStream = Readable.toWeb(archive) as ReadableStream;
    return new Response(webStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(iface)}-peers.zip"`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
