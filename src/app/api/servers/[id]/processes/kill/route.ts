import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError, ApiError } from "@/lib/api-helpers";
import { execOnServer, buildKillCommand } from "@/lib/ssh";
import { writeAuditLog } from "@/lib/audit";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { id } = await params;
    const body = await req.json();

    const pid = Number(body.pid);
    const signal = body.signal === "KILL" ? "KILL" : "TERM";
    if (!Number.isInteger(pid) || pid <= 1) {
      throw new ApiError(400, "INVALID_PID");
    }

    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    const command = buildKillCommand(pid, signal);
    const result = await execOnServer(server, command);

    await writeAuditLog(session, "process.kill", {
      serverId: id,
      detail: `pid=${pid} signal=${signal} exitCode=${result.code}`,
    });

    if (result.code !== 0) {
      throw new ApiError(500, "KILL_FAILED", result.stderr.trim() || undefined);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
