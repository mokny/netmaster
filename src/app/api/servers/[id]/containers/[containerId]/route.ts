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
import { parseIpsJson } from "@/lib/monitor/ip-cache";
import { resolveTimeRange, downsampleRows } from "@/lib/monitor/time-range";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; containerId: string }> }
) {
  try {
    await requireSession();
    const { id, containerId } = await params;

    const server = await prisma.server.findUnique({
      where: { id },
      select: { id: true, name: true, retentionDays: true },
    });
    if (!server) throw new ApiError(404, "SERVER_NOT_FOUND");

    const { searchParams } = new URL(req.url);
    const { from, to } = resolveTimeRange(searchParams, server.retentionDays);

    const latest = await prisma.dockerContainerSnapshot.findFirst({
      where: { serverId: id, containerId },
      orderBy: { timestamp: "desc" },
    });
    if (!latest) throw new ApiError(404, "CONTAINER_NOT_FOUND");

    const rawSamples = await prisma.dockerContainerSnapshot.findMany({
      where: { serverId: id, containerId, timestamp: { gte: from, lte: to } },
      orderBy: { timestamp: "asc" },
    });
    const samples = downsampleRows(rawSamples, from, to, [
      "cpuPercent",
      "memUsageMb",
      "netRxMb",
      "netTxMb",
    ]);

    const state = await prisma.dockerContainerState.findUnique({
      where: { serverId_containerId: { serverId: id, containerId } },
      select: { ipsJson: true },
    });

    return NextResponse.json({
      container: { ...latest, server, ips: parseIpsJson(state?.ipsJson ?? "[]") },
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
    if (!latest) throw new ApiError(404, "CONTAINER_NOT_FOUND");

    let command: string;
    try {
      command = buildDockerRemoveContainerCommand(containerId, force);
    } catch (err) {
      throw new ApiError(400, "INVALID_CONTAINER_ID", err instanceof Error ? err.message : undefined);
    }

    const result = await execOnServer(server, command, 30_000);
    if (result.code !== 0 && result.code !== null) {
      throw new ApiError(500, "DELETE_FAILED", result.stderr.trim() || undefined);
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
