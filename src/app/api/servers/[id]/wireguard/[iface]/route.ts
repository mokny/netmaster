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
  buildReadConfigCommand,
  buildWriteConfigCommand,
  buildDeleteInterfaceCommand,
  buildStatusCommand,
  parseWgConfig,
  parseStatus,
  validateIfaceName,
} from "@/lib/wireguard";

async function derivePublicKey(server: Awaited<ReturnType<typeof prisma.server.findUniqueOrThrow>>, privateKey: string) {
  const res = await execOnServer(server, "wg pubkey", 10_000, `${privateKey}\n`);
  return res.stdout.trim() || null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; iface: string }> }
) {
  try {
    await requireSession();
    const { id, iface } = await params;
    validateIfaceName(iface);
    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    requireWireguardEnabled(server);

    const { command, stdin } = buildReadConfigCommand(server, iface);
    const readRes = await execOnServer(server, command, 15_000, stdin);
    if (readRes.code !== 0 && !readRes.stdout.trim()) {
      throw new ApiError(404, "INTERFACE_NOT_FOUND");
    }
    const raw = readRes.stdout;
    const config = parseWgConfig(iface, raw);

    const statusCmd = buildStatusCommand(server, iface);
    const statusRes = await execOnServer(server, statusCmd.command, 15_000, statusCmd.stdin);
    const status = parseStatus(iface, statusRes.stdout);

    const publicKey = config.privateKey ? await derivePublicKey(server, config.privateKey) : null;

    return NextResponse.json({
      config: { ...config, privateKey: undefined },
      publicKey,
      raw,
      status,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; iface: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { id, iface } = await params;
    validateIfaceName(iface);
    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    requireWireguardEnabled(server);

    const body = (await req.json()) as { raw: string };
    if (typeof body.raw !== "string" || !body.raw.trim()) {
      throw new ApiError(400, "CONFIG_TEXT_REQUIRED");
    }

    const { command, stdin } = buildWriteConfigCommand(server, iface, body.raw);
    const res = await execOnServer(server, command, 15_000, stdin);
    if (res.code !== 0) {
      throw new ApiError(400, "CONFIG_INVALID_OR_WRITE_FAILED", res.stderr.trim() || undefined);
    }

    await writeAuditLog(session, "wireguard.interface.edit-raw", {
      serverId: id,
      detail: `Interface ${iface} Konfiguration bearbeitet`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; iface: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { id, iface } = await params;
    validateIfaceName(iface);
    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    requireWireguardEnabled(server);

    const { command, stdin } = buildDeleteInterfaceCommand(server, iface);
    const res = await execOnServer(server, command, 20_000, stdin);
    if (res.code !== 0) {
      throw new ApiError(500, "DELETE_FAILED", res.stderr.trim() || undefined);
    }

    await writeAuditLog(session, "wireguard.interface.delete", {
      serverId: id,
      detail: `Interface ${iface} gelöscht`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
