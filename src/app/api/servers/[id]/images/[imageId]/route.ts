import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError, ApiError, requireDockerEnabled } from "@/lib/api-helpers";
import { execOnServer, buildDockerImageRemoveCommand } from "@/lib/ssh";
import { writeAuditLog } from "@/lib/audit";
import { collectDockerImages } from "@/lib/monitor/collect";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { id, imageId } = await params;

    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "true";

    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    requireDockerEnabled(server);

    const latest = await prisma.dockerImageSnapshot.findFirst({
      where: { serverId: id, imageId },
      orderBy: { timestamp: "desc" },
    });
    if (!latest) throw new ApiError(404, "IMAGE_NOT_FOUND");

    let command: string;
    try {
      command = buildDockerImageRemoveCommand(imageId, force);
    } catch (err) {
      throw new ApiError(400, "INVALID_IMAGE_ID", err instanceof Error ? err.message : undefined);
    }

    const result = await execOnServer(server, command, 30_000);
    if (result.code !== 0 && result.code !== null) {
      throw new ApiError(500, "DELETE_FAILED", result.stderr.trim() || undefined);
    }

    await writeAuditLog(session, "docker.image.remove", {
      serverId: id,
      detail: `imageId=${imageId} repository=${latest.repository}:${latest.tag}`,
    });

    await collectDockerImages(server);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
