import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-helpers";
import { parseIpsJson } from "@/lib/monitor/ip-cache";
import type { ContainerWithServerDTO } from "@/lib/types";

export async function GET() {
  try {
    await requireSession();

    const servers = await prisma.server.findMany({
      where: { dockerEnabled: true },
      select: { id: true, name: true },
    });

    const perServer = await Promise.all(
      servers.map(async (server) => {
        const latest = await prisma.dockerContainerSnapshot.findFirst({
          where: { serverId: server.id },
          orderBy: { timestamp: "desc" },
        });
        if (!latest) return [];
        const snapshots = await prisma.dockerContainerSnapshot.findMany({
          where: { serverId: server.id, timestamp: latest.timestamp },
        });
        const states = await prisma.dockerContainerState.findMany({
          where: { serverId: server.id },
          select: { containerId: true, ipsJson: true },
        });
        const ipsByContainer = new Map(states.map((s) => [s.containerId, s.ipsJson]));
        return snapshots.map(
          (s): ContainerWithServerDTO => ({
            id: s.id,
            containerId: s.containerId,
            name: s.name,
            image: s.image,
            state: s.state,
            cpuPercent: s.cpuPercent,
            memUsageMb: s.memUsageMb,
            netRxMb: s.netRxMb,
            netTxMb: s.netTxMb,
            ips: parseIpsJson(ipsByContainer.get(s.containerId) ?? "[]"),
            serverId: server.id,
            serverName: server.name,
            timestamp: s.timestamp.toISOString(),
          })
        );
      })
    );

    const containers = perServer.flat().sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ containers });
  } catch (err) {
    return handleApiError(err);
  }
}
