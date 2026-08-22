import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-helpers";
import { attachIps, vmIpKey } from "@/lib/monitor/ip-cache";
import { ensureFreshProxmoxPoll } from "@/lib/monitor/scheduler";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;

    ensureFreshProxmoxPoll(id);

    const vms = await prisma.proxmoxVm.findMany({
      where: { serverId: id },
      orderBy: [{ type: "asc" }, { vmid: "asc" }],
    });
    const withIps = attachIps(vms, (v) => vmIpKey(v.serverId, v.vmid));

    return NextResponse.json({ vms: withIps });
  } catch (err) {
    return handleApiError(err);
  }
}
