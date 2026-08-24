import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError } from "@/lib/api-helpers";
import { resolveTimeRange, downsampleRows } from "@/lib/monitor/time-range";

// Verlaufs-Samples für den Durchsatz-Graph in der Router-Übersicht. Feste
// 7-Tage-Aufbewahrung (siehe RouterSample-Kommentar im Schema) statt eines
// konfigurierbaren retentionDays-Felds.
const ROUTER_SAMPLE_RETENTION_DAYS = 7;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("ADMIN");
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const { from, to } = resolveTimeRange(searchParams, ROUTER_SAMPLE_RETENTION_DAYS);

    const rawSamples = await prisma.routerSample.findMany({
      where: { routerDeviceId: id, timestamp: { gte: from, lte: to } },
      orderBy: { timestamp: "asc" },
    });
    const samples = downsampleRows(rawSamples, from, to, [
      "bytesReceived",
      "bytesSent",
      "connectedDevices",
    ]);

    return NextResponse.json({ samples });
  } catch (err) {
    return handleApiError(err);
  }
}
