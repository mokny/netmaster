import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError } from "@/lib/api-helpers";
import { resolveTimeRange } from "@/lib/monitor/time-range";

// Rohe (nie downgesampelte) Poll-Ausführungs-Historie für die Debug-Ansicht
// (admin/debug/[serverId]) - siehe PollLog im Schema, 2 Tage Retention.
const POLL_LOG_MAX_WINDOW_DAYS = 2;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("ADMIN");
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const { from, to } = resolveTimeRange(searchParams, POLL_LOG_MAX_WINDOW_DAYS);

    const entries = await prisma.pollLog.findMany({
      where: { serverId: id, timestamp: { gte: from, lte: to } },
      orderBy: { timestamp: "asc" },
    });

    return NextResponse.json({ entries });
  } catch (err) {
    return handleApiError(err);
  }
}
