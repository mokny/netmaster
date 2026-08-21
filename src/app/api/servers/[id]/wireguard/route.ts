import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireSession,
  requireRole,
  requireWireguardEnabled,
  handleApiError,
  ApiError,
} from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { execOnServer } from "@/lib/ssh";
import {
  isWireguardInstalled,
  buildListInterfacesCommand,
  parseInterfaceNames,
  validateIfaceName,
  serializeWgConfig,
  buildWriteConfigCommand,
  buildControlCommand,
  generateKeypair,
  buildNatRules,
  type WgInterfaceConfig,
} from "@/lib/wireguard";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;
    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    requireWireguardEnabled(server);

    const installed = await isWireguardInstalled(server);
    if (!installed) {
      return NextResponse.json({ installed: false, interfaces: [] });
    }
    const { command, stdin } = buildListInterfacesCommand(server);
    const res = await execOnServer(server, command, 15_000, stdin);
    const interfaces = parseInterfaceNames(res.stdout);
    return NextResponse.json({ installed: true, interfaces });
  } catch (err) {
    return handleApiError(err);
  }
}

interface CreateBody {
  name: string;
  address: string;
  listenPort: number;
  dns?: string;
  mtu?: number;
  nat?: { egressIface: string };
  autoStart?: boolean;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { id } = await params;
    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    requireWireguardEnabled(server);

    const body = (await req.json()) as CreateBody;
    validateIfaceName(body.name);
    if (!body.address || typeof body.address !== "string") {
      throw new ApiError(400, "ADDRESS_REQUIRED");
    }
    if (!Number.isInteger(body.listenPort) || body.listenPort < 1 || body.listenPort > 65535) {
      throw new ApiError(400, "INVALID_LISTEN_PORT");
    }

    const { privateKey } = await generateKeypair(server);

    const config: WgInterfaceConfig = {
      name: body.name,
      address: body.address,
      listenPort: body.listenPort,
      privateKey,
      dns: body.dns || undefined,
      mtu: body.mtu || undefined,
      peers: [],
    };

    if (body.nat?.egressIface) {
      const { postUp, postDown } = buildNatRules(body.name, body.nat.egressIface);
      config.postUp = postUp;
      config.postDown = postDown;
    }

    const raw = serializeWgConfig(config);
    const { command, stdin } = buildWriteConfigCommand(server, body.name, raw);
    const writeRes = await execOnServer(server, command, 15_000, stdin);
    if (writeRes.code !== 0) {
      throw new ApiError(400, "WRITE_CONFIG_FAILED", writeRes.stderr.trim() || undefined);
    }

    if (body.autoStart !== false) {
      const startCmd = buildControlCommand(server, body.name, "enable");
      await execOnServer(server, startCmd.command, 15_000, startCmd.stdin);
      const upCmd = buildControlCommand(server, body.name, "start");
      await execOnServer(server, upCmd.command, 15_000, upCmd.stdin);
    }

    await writeAuditLog(session, "wireguard.interface.create", {
      serverId: id,
      detail: `Interface ${body.name} (Port ${body.listenPort}) angelegt`,
    });

    return NextResponse.json({ ok: true, name: body.name });
  } catch (err) {
    return handleApiError(err);
  }
}
