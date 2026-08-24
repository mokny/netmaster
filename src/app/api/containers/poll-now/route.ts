import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-helpers";
import { collectDockerContainers } from "@/lib/monitor/collect";

export async function POST() {
  try {
    await requireSession();

    const servers = await prisma.server.findMany({ where: { dockerEnabled: true } });
    await Promise.all(servers.map((s) => collectDockerContainers(s, "on_demand")));

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
