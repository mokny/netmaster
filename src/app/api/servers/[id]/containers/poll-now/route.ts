import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError, requireDockerEnabled } from "@/lib/api-helpers";
import { collectDockerContainers, collectDockerImages } from "@/lib/monitor/collect";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;

    const server = await prisma.server.findUnique({ where: { id } });
    if (!server) throw new ApiError(404, "SERVER_NOT_FOUND");
    requireDockerEnabled(server);

    await Promise.all([collectDockerContainers(server, "on_demand"), collectDockerImages(server)]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
