import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireWireguardEnabled, handleApiError, ApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { execOnServer } from "@/lib/ssh";
import { buildControlCommand, validateIfaceName, type WgAction } from "@/lib/wireguard";

const ACTIONS: WgAction[] = ["start", "stop", "restart", "enable", "disable"];

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

    const body = (await req.json()) as { action: WgAction };
    if (!ACTIONS.includes(body.action)) {
      throw new ApiError(400, "Ungültige Aktion");
    }

    const { command, stdin } = buildControlCommand(server, iface, body.action);
    const res = await execOnServer(server, command, 15_000, stdin);
    if (res.code !== 0) {
      throw new ApiError(500, res.stderr.trim() || `${body.action} fehlgeschlagen`);
    }

    await writeAuditLog(session, `wireguard.interface.${body.action}`, {
      serverId: id,
      detail: `Interface ${iface}`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
