import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-helpers";
import { getCachedIps, vmIpKey } from "@/lib/monitor/ip-cache";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; vmid: string }> }
) {
  try {
    await requireSession();
    const { id, vmid } = await params;
    const vmidNum = Number(vmid);
    if (!Number.isInteger(vmidNum)) throw new ApiError(400, "Ungültige VM-ID");

    const { searchParams } = new URL(req.url);
    const hours = Math.min(24 * 30, Math.max(1, Number(searchParams.get("hours") ?? 6)));
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const vm = await prisma.proxmoxVm.findUnique({
      where: { serverId_vmid: { serverId: id, vmid: vmidNum } },
      include: { server: { select: { id: true, name: true } } },
    });
    if (!vm) throw new ApiError(404, "VM nicht gefunden");

    const samples = await prisma.proxmoxVmSample.findMany({
      where: { vmId: vm.id, timestamp: { gte: since } },
      orderBy: { timestamp: "asc" },
    });

    return NextResponse.json({
      vm: { ...vm, ips: getCachedIps(vmIpKey(id, vmidNum)) ?? [] },
      samples,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
