import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireSession,
  requireRole,
  handleApiError,
  ApiError,
  requireDockerEnabled,
} from "@/lib/api-helpers";
import { execOnServer, buildDockerRemoveContainerCommand } from "@/lib/ssh";
import { writeAuditLog } from "@/lib/audit";
import { collectDockerContainers } from "@/lib/monitor/collect";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; containerId: string }> }
) {
  try {
    await requireSession();
    const { id, containerId } = await params;

    const { searchParams } = new URL(req.url);
    const hours = Math.min(24 * 30, Math.max(1, Number(searchParams.get("hours") ?? 6)));
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const server = await prisma.server.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!server) throw new ApiError(404, "Server nicht gefunden");

    const latest = await prisma.dockerContainerSnapshot.findFirst({
      where: { serverId: id, containerId },
      orderBy: { timestamp: "desc" },
    });
    if (!latest) throw new ApiError(404, "Container nicht gefunden");

    const samples = await prisma.dockerContainerSnapshot.findMany({
      where: { serverId: id, containerId, timestamp: { gte: since } },
      orderBy: { timestamp: "asc" },
    });

    return NextResponse.json({
      container: { ...latest, server },
      samples,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; containerId: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { id, containerId } = await params;

    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "true";

    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    requireDockerEnabled(server);

    const latest = await prisma.dockerContainerSnapshot.findFirst({
      where: { serverId: id, containerId },
      orderBy: { timestamp: "desc" },
    });
    if (!latest) throw new ApiError(404, "Container nicht gefunden");

    let command: string;
    try {
      command = buildDockerRemoveContainerCommand(containerId, force);
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : "Ungültige Container-ID");
    }

    const result = await execOnServer(server, command, 30_000);
    if (result.code !== 0 && result.code !== null) {
      throw new ApiError(500, result.stderr.trim() || "Löschen fehlgeschlagen");
    }

    await writeAuditLog(session, "docker.container.remove", {
      serverId: id,
      detail: `containerId=${containerId} name=${latest.name}`,
    });

    await prisma.dockerContainerSnapshot.deleteMany({ where: { serverId: id, containerId } });
    await collectDockerContainers(server);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
