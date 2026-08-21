import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireWireguardEnabled, handleApiError, ApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { execOnServer } from "@/lib/ssh";
import { buildInstallCommand } from "@/lib/wireguard";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { id } = await params;
    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    requireWireguardEnabled(server);

    const { command, stdin } = buildInstallCommand(server);
    const res = await execOnServer(server, command, 120_000, stdin);
    if (res.code !== 0) {
      throw new ApiError(500, res.stderr.trim() || "Installation fehlgeschlagen");
    }

    await writeAuditLog(session, "wireguard.install", { serverId: id });

    return NextResponse.json({ ok: true, output: res.stdout });
  } catch (err) {
    return handleApiError(err);
  }
}
