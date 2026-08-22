import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-helpers";
import { refreshDockerIp } from "@/lib/monitor/collect";
import { getCachedIps, dockerIpKey } from "@/lib/monitor/ip-cache";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; containerId: string }> }
) {
  try {
    await requireSession();
    const { id, containerId } = await params;

    const server = await prisma.server.findUnique({ where: { id } });
    if (!server) throw new ApiError(404, "SERVER_NOT_FOUND");

    const latest = await prisma.dockerContainerSnapshot.findFirst({
      where: { serverId: id, containerId },
      orderBy: { timestamp: "desc" },
    });
    if (!latest) throw new ApiError(404, "CONTAINER_NOT_FOUND");

    await refreshDockerIp(server, containerId, true);

    return NextResponse.json({ ips: getCachedIps(dockerIpKey(id, containerId)) ?? [] });
  } catch (err) {
    return handleApiError(err);
  }
}
