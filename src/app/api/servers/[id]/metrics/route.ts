import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-helpers";
import { resolveTimeRange, downsampleRows } from "@/lib/monitor/time-range";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;
    const server = await prisma.server.findUnique({
      where: { id },
      select: { retentionDays: true },
    });
    if (!server) throw new ApiError(404, "SERVER_NOT_FOUND");

    const { searchParams } = new URL(req.url);
    const { from, to } = resolveTimeRange(searchParams, server.retentionDays);

    const [rawSamples, rawDiskSamples, latestDisks] = await Promise.all([
      prisma.metricSample.findMany({
        where: { serverId: id, timestamp: { gte: from, lte: to } },
        orderBy: { timestamp: "asc" },
      }),
      prisma.diskSample.findMany({
        where: { serverId: id, timestamp: { gte: from, lte: to } },
        orderBy: { timestamp: "asc" },
      }),
      prisma.diskSample.findMany({
        where: { serverId: id },
        distinct: ["mountpoint"],
        orderBy: { timestamp: "desc" },
      }),
    ]);

    const samples = downsampleRows(rawSamples, from, to, [
      "cpuPercent",
      "memPercent",
      "diskPercent",
      "loadAvg1",
      "loadAvg5",
      "loadAvg15",
      "netRxBytes",
      "netTxBytes",
    ]);

    const diskByMount = new Map<string, typeof rawDiskSamples>();
    for (const d of rawDiskSamples) {
      const arr = diskByMount.get(d.mountpoint);
      if (arr) arr.push(d);
      else diskByMount.set(d.mountpoint, [d]);
    }
    const diskSamples = Array.from(diskByMount.values())
      .flatMap((rows) => downsampleRows(rows, from, to, ["totalKb", "usedKb", "percent"]))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const disks = latestDisks
      .sort((a, b) => a.mountpoint.localeCompare(b.mountpoint))
      .map((d) => ({
        mountpoint: d.mountpoint,
        device: d.device,
        totalKb: d.totalKb,
        percent: d.percent,
      }));

    return NextResponse.json({ samples, diskSamples, disks });
  } catch (err) {
    return handleApiError(err);
  }
}
