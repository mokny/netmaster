import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-helpers";
import { getCachedIps, vmIpKey } from "@/lib/monitor/ip-cache";
import { ensureFreshProxmoxPoll } from "@/lib/monitor/scheduler";

export async function GET() {
  try {
    await requireSession();

    const vms = await prisma.proxmoxVm.findMany({
      where: { server: { proxmoxEnabled: true } },
      orderBy: [{ name: "asc" }],
      include: { server: { select: { id: true, name: true } } },
    });

    // Stößt pro Server (debounced, siehe scheduler.ts) einen frischen Poll an,
    // statt bis zum nächsten vmDockerPollIntervalSec-Tick zu warten.
    for (const serverId of new Set(vms.map((v) => v.serverId))) {
      ensureFreshProxmoxPoll(serverId);
    }

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
      ips: getCachedIps(vmIpKey(v.serverId, v.vmid)) ?? [],
    }));

    return NextResponse.json({ vms: dtos });
  } catch (err) {
    return handleApiError(err);
  }
}
