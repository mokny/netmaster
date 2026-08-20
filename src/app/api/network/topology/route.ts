import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-helpers";
import { buildRootScriptCommand } from "@/lib/ssh";
import { execPooled } from "@/lib/ssh-pool";
import { PORTS_COMMAND, parsePortsOutput, type PortsSnapshot } from "@/lib/ports";

interface NodeInfo {
  serverId: string;
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
    await requireSession();
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
      serverId: server.id,
      name: server.name,
      addresses: [server.hostname, ...snapshot.interfaces.map((i) => i.address)],
      status: error ? "error" : "ok",
      error: error ?? undefined,
    }));

    // Baut eine Adresse -> Server-ID Lookup-Tabelle für die Korrelation
    // (erweiterter Abgleich: alle lokalen Interface-IPs, nicht nur die
    // konfigurierte SSH-Host-Adresse).
    const addressToServerId = new Map<string, string>();
    for (const node of nodes) {
      for (const addr of node.addresses) {
        addressToServerId.set(addr, node.serverId);
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
