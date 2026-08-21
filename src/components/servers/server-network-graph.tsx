"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import "@xyflow/react/dist/style.css";
import { ReactFlow, Background, Controls, type Node, type Edge, MarkerType } from "@xyflow/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Waypoints } from "lucide-react";

interface PortEntry {
  protocol: "tcp" | "udp";
  state: string;
  localPort: number;
  peerAddress: string | null;
  peerPort: number | null;
  program: string | null;
  pid: number | null;
}

const POLL_MS = 15_000;
const COL_GAP = 260;
const ROW_GAP = 56;

function buildGraph(ports: PortEntry[]): { nodes: Node[]; edges: Edge[] } {
  const programs = new Map<string, string>(); // key -> id
  const portNodes = new Map<string, string>();
  const peerNodes = new Map<string, string>();
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  let programRow = 0;
  let portRow = 0;
  let peerRow = 0;

  for (const p of ports) {
    const progKey = p.program ? `${p.program}:${p.pid}` : "unbekannt";
    let progId = programs.get(progKey);
    if (!progId) {
      progId = `prog-${programs.size}`;
      programs.set(progKey, progId);
      nodes.push({
        id: progId,
        position: { x: 0, y: programRow * ROW_GAP },
        data: { label: p.program ? `${p.program} (${p.pid})` : "unbekannt" },
        style: { background: "#3b82f6", color: "white", borderRadius: 8, fontSize: 12 },
      });
      programRow += 1;
    }

    const portKey = `${p.protocol}:${p.localPort}`;
    let portId = portNodes.get(portKey);
    if (!portId) {
      portId = `port-${portNodes.size}`;
      portNodes.set(portKey, portId);
      nodes.push({
        id: portId,
        position: { x: COL_GAP, y: portRow * ROW_GAP },
        data: { label: `${p.protocol.toUpperCase()}/${p.localPort}` },
        style: { background: "#a855f7", color: "white", borderRadius: 8, fontSize: 12 },
      });
      portRow += 1;
    }
    edges.push({
      id: `e-${progId}-${portId}`,
      source: progId,
      target: portId,
      markerEnd: { type: MarkerType.ArrowClosed },
    });

    if (p.peerAddress) {
      const peerKey = `${p.peerAddress}:${p.peerPort}`;
      let peerId = peerNodes.get(peerKey);
      if (!peerId) {
        peerId = `peer-${peerNodes.size}`;
        peerNodes.set(peerKey, peerId);
        nodes.push({
          id: peerId,
          position: { x: COL_GAP * 2, y: peerRow * ROW_GAP },
          data: { label: `${p.peerAddress}:${p.peerPort}` },
          style: { background: "#f59e0b", color: "white", borderRadius: 8, fontSize: 12 },
        });
        peerRow += 1;
      }
      edges.push({
        id: `e-${portId}-${peerId}`,
        source: portId,
        target: peerId,
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    }
  }

  return { nodes, edges };
}

export function ServerNetworkGraph({ serverId }: { serverId: string }) {
  const t = useTranslations("servers.networkGraph");
  const tErrors = useTranslations("errors");
  const [ports, setPorts] = useState<PortEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const res = await fetch(`/api/servers/${serverId}/ports`);
        const data = await res.json().catch(() => ({}));
        if (stopped) return;
        if (!res.ok) {
          setError(data.error ? tErrors(data.error) : t("fetchFailed"));
          return;
        }
        setPorts(data.ports);
        setError(null);
      } catch {
        if (!stopped) setError(t("connectionFailed"));
      }
    }
    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [serverId]);

  const { nodes, edges } = useMemo(() => buildGraph(ports ?? []), [ports]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>{t("cardTitle")}</CardTitle>
          <CardDescription>{t("cardDescription")}</CardDescription>
        </div>
        <Waypoints className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {error && <p className="mb-2 text-sm text-red-500">{error}</p>}
        <div className="h-96 w-full overflow-hidden rounded-md border">
          {!ports ? (
            <p className="p-4 text-sm text-muted-foreground">{t("loadingGraph")}</p>
          ) : nodes.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{t("noGraphData")}</p>
          ) : (
            <ReactFlow nodes={nodes} edges={edges} fitView colorMode="system" proOptions={{ hideAttribution: true }}>
              <Background />
              <Controls showInteractive={false} />
            </ReactFlow>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
