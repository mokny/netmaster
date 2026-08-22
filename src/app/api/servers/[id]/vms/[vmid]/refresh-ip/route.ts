import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-helpers";
import { refreshVmIp } from "@/lib/monitor/collect";
import { getCachedIps, vmIpKey } from "@/lib/monitor/ip-cache";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; vmid: string }> }
) {
  try {
    await requireSession();
    const { id, vmid } = await params;
    const vmidNum = Number(vmid);
    if (!Number.isInteger(vmidNum)) throw new ApiError(400, "INVALID_VM_ID");

    const server = await prisma.server.findUnique({ where: { id } });
    if (!server) throw new ApiError(404, "SERVER_NOT_FOUND");

    const vm = await prisma.proxmoxVm.findUnique({
      where: { serverId_vmid: { serverId: id, vmid: vmidNum } },
    });
    if (!vm) throw new ApiError(404, "VM_NOT_FOUND");

    await refreshVmIp(server, vm.type === "QEMU" ? "qemu" : "lxc", vmidNum, true);

    return NextResponse.json({ ips: getCachedIps(vmIpKey(id, vmidNum)) ?? [] });
  } catch (err) {
    return handleApiError(err);
  }
}
