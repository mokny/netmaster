import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-helpers";

export async function GET() {
  try {
    await requireSession();

    const vms = await prisma.proxmoxVm.findMany({
      orderBy: [{ name: "asc" }],
      include: { server: { select: { id: true, name: true } } },
    });

    const dtos = vms.map((v) => ({
      id: v.id,
      serverId: v.serverId,
      serverName: v.server.name,
      vmid: v.vmid,
      type: v.type,
      name: v.name,
      status: v.status,
      cpuPercent: v.cpuPercent,
      memUsedMb: v.memUsedMb,
      memTotalMb: v.memTotalMb,
      diskUsedGb: v.diskUsedGb,
      diskTotalGb: v.diskTotalGb,
    }));

    return NextResponse.json({ vms: dtos });
  } catch (err) {
    return handleApiError(err);
  }
}
