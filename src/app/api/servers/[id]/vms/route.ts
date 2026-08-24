import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-helpers";
import { parseIpsJson } from "@/lib/monitor/ip-cache";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;

    const vms = await prisma.proxmoxVm.findMany({
      where: { serverId: id },
      orderBy: [{ type: "asc" }, { vmid: "asc" }],
    });
    const withIps = vms.map((v) => ({ ...v, ips: parseIpsJson(v.ipsJson) }));

    return NextResponse.json({ vms: withIps });
  } catch (err) {
    return handleApiError(err);
  }
}
