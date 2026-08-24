import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-helpers";
import { hasRole } from "@/lib/auth";
import { buildRootScriptCommand } from "@/lib/ssh";
import { execPooled } from "@/lib/ssh-pool";
import { PORTS_COMMAND, parsePortsOutput, type PortsSnapshot } from "@/lib/ports";

interface NodeInfo {
  id: string;
  kind: "server" | "router" | "repeater" | "client";
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

interface RouterHostEntry {
  name: string;
  ip: string;
  mac: string;
  active: boolean;
  interfaceType: string;
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

    const clientEdges: EdgeInfo[] = [];

    // Adresse -> Server-ID Lookup-Tabelle (alle lokalen Interface-IPs der
    // Server, nicht nur die konfigurierte SSH-Host-Adresse). Wird sowohl für
    // die Server<->Server-Korrelation als auch für den Router/Repeater-Host-
    // Abgleich unten verwendet, damit angelegte Server nicht als doppelter
    // "client"-Knoten neben ihrem echten Server-Knoten auftauchen.
    const addressToServerId = new Map<string, string>();
    for (const { server, snapshot } of results) {
      addressToServerId.set(server.hostname, server.id);
      for (const addr of snapshot.interfaces.map((i) => i.address)) {
        addressToServerId.set(addr, server.id);
      }
    }

    // Router/Repeater-Verwaltung ist Admin-only (siehe /api/router-devices) -
    // in der Topologie werden sie deshalb nur für Admins mit angezeigt.
    if (hasRole(session, "ADMIN")) {
      const routerDevices = await prisma.routerDevice.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          type: true,
          hostname: true,
          lastStatus: true,
          lastError: true,
          connectedHostsJson: true,
        },
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

      // Client-Geräte (per TR-064 auf Router/Repeater erkannt): ein MAC kann
      // in mehreren Geräte-Host-Listen auftauchen (z.B. Mesh-Client sichtbar
      // auf FritzBox und Repeater). Da es kein explizites Uplink-/Parent-Feld
      // gibt, wird der Repeater bevorzugt, da er der Client-Verbindung
      // topologisch näher ist (siehe Schema-Kommentar bei RouterDevice).
      const clientOwner = new Map<string, { deviceNodeId: string; host: RouterHostEntry; priority: number }>();
      for (const device of routerDevices) {
        const priority = device.type === "REPEATER" ? 1 : 0;
        let hosts: RouterHostEntry[] = [];
        try {
          hosts = JSON.parse(device.connectedHostsJson || "[]");
        } catch {
          hosts = [];
        }
        for (const host of hosts) {
          if (!host.active || !host.mac) continue;
          const existing = clientOwner.get(host.mac);
          if (!existing || priority > existing.priority) {
            clientOwner.set(host.mac, { deviceNodeId: `router:${device.id}`, host, priority });
          }
        }
      }

      for (const [mac, { deviceNodeId, host }] of clientOwner) {
        // Host-IP gehört zu einem angelegten Server -> direkt mit dem
        // existierenden Server-Knoten verbinden statt einen doppelten
        // "client"-Knoten für denselben Host anzulegen.
        const matchedServerId = host.ip ? addressToServerId.get(host.ip) : undefined;
        if (matchedServerId) {
          clientEdges.push({ fromServerId: deviceNodeId, toServerId: matchedServerId, connectionCount: 1 });
          continue;
        }
        const clientNodeId = `client:${mac}`;
        nodes.push({
          id: clientNodeId,
          kind: "client",
          name: host.name || host.ip || mac,
          addresses: [host.ip].filter(Boolean),
          status: "ok",
        });
        clientEdges.push({ fromServerId: deviceNodeId, toServerId: clientNodeId, connectionCount: 1 });
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

    return NextResponse.json({ nodes, edges: [...edgeCounts.values(), ...clientEdges] });
  } catch (err) {
    return handleApiError(err);
  }
}
