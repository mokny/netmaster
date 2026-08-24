import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-helpers";
import { collectProxmoxVms } from "@/lib/monitor/collect";

export async function POST() {
  try {
    await requireSession();

    const servers = await prisma.server.findMany({ where: { proxmoxEnabled: true } });
    await Promise.all(servers.map((s) => collectProxmoxVms(s, "on_demand")));

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
