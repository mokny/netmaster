import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-helpers";
import { hasRole } from "@/lib/auth";
import { buildRootScriptCommand } from "@/lib/ssh";
import { execPooled } from "@/lib/ssh-pool";
import { PORTS_COMMAND, parsePortsOutput, type PortsSnapshot } from "@/lib/ports";

interface NodeInfo {
  id: string;
  kind: "server" | "router" | "repeater";
  name: string;
  addresses: string[];
  status: "ok" | "error";
  error?: string;
}

interface EdgeInfo {
  fromServerId: string;
  toServerId: string;
  connectionCount: number;
}

export async function GET() {
  try {
    const session = await requireSession();
    const servers = await prisma.server.findMany({
      where: { networkToolsEnabled: true },
      orderBy: { name: "asc" },
    });

    const results = await Promise.all(
      servers.map(async (server) => {
        try {
          const { command, stdin } = buildRootScriptCommand(server, PORTS_COMMAND);
          const res = await execPooled(server, command, 15_000, stdin);
          return { server, snapshot: parsePortsOutput(res.stdout) as PortsSnapshot, error: null as string | null };
        } catch (err) {
          return {
            server,
            snapshot: { ports: [], interfaces: [] } as PortsSnapshot,
            error: err instanceof Error ? err.message : "Fehler",
          };
        }
      })
    );

    const nodes: NodeInfo[] = results.map(({ server, snapshot, error }) => ({
      id: server.id,
      kind: "server",
      name: server.name,
      addresses: [server.hostname, ...snapshot.interfaces.map((i) => i.address)],
      status: error ? "error" : "ok",
      error: error ?? undefined,
    }));

    // Router/Repeater-Verwaltung ist Admin-only (siehe /api/router-devices) -
    // in der Topologie werden sie deshalb nur für Admins mit angezeigt.
    if (hasRole(session, "ADMIN")) {
      const routerDevices = await prisma.routerDevice.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, type: true, hostname: true, lastStatus: true, lastError: true },
      });
      for (const device of routerDevices) {
        nodes.push({
          id: `router:${device.id}`,
          kind: device.type === "REPEATER" ? "repeater" : "router",
          name: device.name,
          addresses: [device.hostname],
          status: device.lastStatus === "OK" ? "ok" : "error",
          error: device.lastStatus === "OK" ? undefined : device.lastError ?? undefined,
        });
      }
    }

    // Baut eine Adresse -> Server-ID Lookup-Tabelle für die Korrelation
    // (erweiterter Abgleich: alle lokalen Interface-IPs, nicht nur die
    // konfigurierte SSH-Host-Adresse). Nur Server nehmen an der
    // Verbindungs-Korrelation teil, da für Router/Repeater keine
    // Ports-Snapshots erhoben werden.
    const addressToServerId = new Map<string, string>();
    for (const { server, snapshot } of results) {
      addressToServerId.set(server.hostname, server.id);
      for (const addr of snapshot.interfaces.map((i) => i.address)) {
        addressToServerId.set(addr, server.id);
      }
    }

    const edgeCounts = new Map<string, EdgeInfo>();
    for (const { server, snapshot } of results) {
      for (const port of snapshot.ports) {
        if (!port.peerAddress) continue;
        const peerServerId = addressToServerId.get(port.peerAddress);
        if (!peerServerId || peerServerId === server.id) continue;
        const key = [server.id, peerServerId].sort().join(":");
        const existing = edgeCounts.get(key);
        if (existing) {
          existing.connectionCount += 1;
        } else {
          edgeCounts.set(key, {
            fromServerId: server.id,
            toServerId: peerServerId,
            connectionCount: 1,
          });
        }
      }
    }

    return NextResponse.json({ nodes, edges: Array.from(edgeCounts.values()) });
  } catch (err) {
    return handleApiError(err);
  }
}
