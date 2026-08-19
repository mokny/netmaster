import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-helpers";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;

    const latest = await prisma.dockerContainerSnapshot.findFirst({
      where: { serverId: id },
      orderBy: { timestamp: "desc" },
    });
    if (!latest) return NextResponse.json({ containers: [], timestamp: null });

    const containers = await prisma.dockerContainerSnapshot.findMany({
      where: { serverId: id, timestamp: latest.timestamp },
    });

    return NextResponse.json({ containers, timestamp: latest.timestamp });
  } catch (err) {
    return handleApiError(err);
  }
}
