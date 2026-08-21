import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError, ApiError, requireDockerEnabled } from "@/lib/api-helpers";
import { execOnServer, buildDockerPowerCommand, type DockerPowerAction } from "@/lib/ssh";
import { writeAuditLog } from "@/lib/audit";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; containerId: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { id, containerId } = await params;

    const body = await req.json();
    if (!["start", "stop", "restart"].includes(body.action)) {
      throw new ApiError(400, "INVALID_ACTION");
    }
    const action: DockerPowerAction = body.action;

    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    requireDockerEnabled(server);
    const latest = await prisma.dockerContainerSnapshot.findFirst({
      where: { serverId: id, containerId },
      orderBy: { timestamp: "desc" },
    });
    if (!latest) throw new ApiError(404, "CONTAINER_NOT_FOUND");

    let command: string;
    try {
      command = buildDockerPowerCommand(containerId, action);
    } catch (err) {
      throw new ApiError(400, "INVALID_CONFIG", err instanceof Error ? err.message : undefined);
    }

    const result = await execOnServer(server, command, 20_000);
    if (result.code !== 0 && result.code !== null) {
      throw new ApiError(500, "ACTION_FAILED", result.stderr.trim() || action);
    }

    await writeAuditLog(session, `docker.${action}`, {
      serverId: id,
      detail: `containerId=${containerId} name=${latest.name}`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
