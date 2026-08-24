import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-helpers";
import { parseIpsJson } from "@/lib/monitor/ip-cache";
import { resolveTimeRange, downsampleRows } from "@/lib/monitor/time-range";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; vmid: string }> }
) {
  try {
    await requireSession();
    const { id, vmid } = await params;
    const vmidNum = Number(vmid);
    if (!Number.isInteger(vmidNum)) throw new ApiError(400, "INVALID_VM_ID");

    const vm = await prisma.proxmoxVm.findUnique({
      where: { serverId_vmid: { serverId: id, vmid: vmidNum } },
      include: { server: { select: { id: true, name: true, retentionDays: true } } },
    });
    if (!vm) throw new ApiError(404, "VM_NOT_FOUND");

    const { searchParams } = new URL(req.url);
    const { from, to } = resolveTimeRange(searchParams, vm.server.retentionDays);

    const rawSamples = await prisma.proxmoxVmSample.findMany({
      where: { vmId: vm.id, timestamp: { gte: from, lte: to } },
      orderBy: { timestamp: "asc" },
    });
    const samples = downsampleRows(rawSamples, from, to, [
      "cpuPercent",
      "memPercent",
      "diskPercent",
    ]);

    return NextResponse.json({
      vm: { ...vm, ips: parseIpsJson(vm.ipsJson) },
      samples,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
