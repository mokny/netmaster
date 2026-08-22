import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError, requireProxmoxEnabled } from "@/lib/api-helpers";
import { collectProxmoxVms } from "@/lib/monitor/collect";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;

    const server = await prisma.server.findUnique({ where: { id } });
    if (!server) throw new ApiError(404, "SERVER_NOT_FOUND");
    requireProxmoxEnabled(server);

    await collectProxmoxVms(server);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
