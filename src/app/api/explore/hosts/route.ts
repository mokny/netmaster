import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-helpers";

type Match = { kind: "server" | "router"; id: string; name: string } | null;

function matchHost(
  hostIp: string,
  hostname: string | null,
  servers: { id: string; name: string; hostname: string }[],
  routers: { id: string; name: string; hostname: string }[]
): Match {
  const candidates = [hostIp.toLowerCase(), hostname?.toLowerCase()].filter(
    (v): v is string => !!v
  );
  for (const server of servers) {
    if (candidates.includes(server.hostname.toLowerCase())) {
      return { kind: "server", id: server.id, name: server.name };
    }
  }
  for (const router of routers) {
    if (candidates.includes(router.hostname.toLowerCase())) {
      return { kind: "router", id: router.id, name: router.name };
    }
  }
  return null;
}

export async function GET() {
  try {
    await requireSession();

    const [hosts, servers, routers] = await Promise.all([
      prisma.discoveredHost.findMany({ orderBy: { lastSeenAt: "desc" } }),
      prisma.server.findMany({ select: { id: true, name: true, hostname: true } }),
      prisma.routerDevice.findMany({ select: { id: true, name: true, hostname: true } }),
    ]);

    const result = hosts.map((host) => ({
      id: host.id,
      ip: host.ip,
      mac: host.mac,
      hostname: host.hostname,
      vendor: host.vendor,
      openPorts: JSON.parse(host.openPortsJson) as {
        port: number;
        service: string;
        version: string;
      }[],
      osGuess: host.osGuess,
      lastSeenOnline: host.lastSeenOnline,
      firstSeenAt: host.firstSeenAt,
      lastSeenAt: host.lastSeenAt,
      matched: matchHost(host.ip, host.hostname, servers, routers),
    }));

    return NextResponse.json({ hosts: result });
  } catch (err) {
    return handleApiError(err);
  }
}
