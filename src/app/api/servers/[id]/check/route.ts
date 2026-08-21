import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-helpers";
import { collectServerMetrics } from "@/lib/monitor/collect";
import { SERVER_SELECT } from "@/app/api/servers/[id]/route";

// Stößt einen sofortigen Metrik-Poll außerhalb des regulären Intervalls an
// (z.B. aus dem Warnung/Kritisch-Modal) und liefert den aktualisierten
// Server-Status zurück.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;
    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    await collectServerMetrics(server);
    const updated = await prisma.server.findUniqueOrThrow({ where: { id }, select: SERVER_SELECT });
    return NextResponse.json({ server: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
