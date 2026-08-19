import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-helpers";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const hours = Math.min(24 * 30, Math.max(1, Number(searchParams.get("hours") ?? 6)));
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [samples, diskSamples, latestDisks] = await Promise.all([
      prisma.metricSample.findMany({
        where: { serverId: id, timestamp: { gte: since } },
        orderBy: { timestamp: "asc" },
      }),
      prisma.diskSample.findMany({
        where: { serverId: id, timestamp: { gte: since } },
        orderBy: { timestamp: "asc" },
      }),
      prisma.diskSample.findMany({
        where: { serverId: id },
        distinct: ["mountpoint"],
        orderBy: { timestamp: "desc" },
      }),
    ]);

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
