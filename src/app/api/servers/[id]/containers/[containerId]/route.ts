import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-helpers";

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
