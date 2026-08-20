"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "@xyflow/react/dist/style.css";
import { ReactFlow, Background, Controls, type Node, type Edge } from "@xyflow/react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { buttonVariants } from "@/components/ui/button";
import { MetricChart, type ChartPoint } from "@/components/servers/metric-chart";
import type { MetricSampleDTO } from "@/lib/types";

interface TopologyNode {
  serverId: string;
  name: string;
  addresses: string[];
  status: "ok" | "error";
  error?: string;
}

interface TopologyEdge {
  fromServerId: string;
  toServerId: string;
  connectionCount: number;
}

const POLL_MS = 20_000;

function layoutCircular(nodes: TopologyNode[]): Node[] {
  const radius = Math.max(160, nodes.length * 40);
  const cx = radius + 60;
  const cy = radius + 60;
  return nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1);
    return {
      id: n.serverId,
      position: { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) },
      data: { label: n.name },
      style: {
        background: n.status === "error" ? "#ef4444" : "#3b82f6",
        color: "white",
        borderRadius: 8,
        fontSize: 12,
        padding: 8,
      },
    };
  });
}

export function TopologyGraph() {
  const [nodes, setNodes] = useState<TopologyNode[] | null>(null);
  const [edges, setEdges] = useState<TopologyEdge[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TopologyNode | null>(null);
  const [samples, setSamples] = useState<MetricSampleDTO[]>([]);

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const res = await fetch("/api/network/topology");
        const data = await res.json().catch(() => ({}));
        if (stopped) return;
        if (!res.ok) {
          setError(data.error ?? "Fehler beim Abrufen der Topologie");
          return;
        }
        setNodes(data.nodes);
        setEdges(data.edges);
        setError(null);
      } catch {
        if (!stopped) setError("Verbindung fehlgeschlagen");
      }
    }
    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    let stopped = false;
    fetch(`/api/servers/${selected.serverId}/metrics?hours=6`)
      .then((res) => res.json())
      .then((data) => {
        if (!stopped) setSamples(data.samples ?? []);
      })
      .catch(() => {});
    return () => {
      stopped = true;
    };
  }, [selected]);

  const flowNodes = useMemo(() => layoutCircular(nodes ?? []), [nodes]);
  const maxCount = Math.max(1, ...edges.map((e) => e.connectionCount));
  const flowEdges: Edge[] = useMemo(
    () =>
      edges.map((e) => ({
        id: `${e.fromServerId}-${e.toServerId}`,
        source: e.fromServerId,
        target: e.toServerId,
        label: `${e.connectionCount} Verbindung${e.connectionCount > 1 ? "en" : ""}`,
        style: { strokeWidth: 1 + (e.connectionCount / maxCount) * 6 },
        animated: true,
      })),
    [edges, maxCount]
  );

  const rxPoints: ChartPoint[] = samples.map((s) => ({
    timestamp: s.timestamp,
    value: s.netRxBytes,
  }));
  const txPoints: ChartPoint[] = samples.map((s) => ({
    timestamp: s.timestamp,
    value: s.netTxBytes,
  }));

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-500">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Kantenstärke = Anzahl aktiver Verbindungen zwischen den Servern. Klick auf einen Server
        zeigt den Netzwerk-Durchsatz.
      </p>
      <div className="h-[600px] w-full overflow-hidden rounded-md border">
        {!nodes ? (
          <p className="p-4 text-sm text-muted-foreground">Lade Topologie…</p>
        ) : nodes.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Keine Server mit aktivierten Netzwerk-Tools gefunden.
          </p>
        ) : (
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            fitView
            colorMode="system"
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_, node) => {
              const found = nodes.find((n) => n.serverId === node.id);
              if (found) setSelected(found);
            }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
      </div>

      <Sheet open={selected != null} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{selected?.name}</SheetTitle>
            <SheetDescription>
              {selected?.status === "error"
                ? `Fehler: ${selected.error}`
                : "Netzwerk-Durchsatz (letzte 6h)"}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-4">
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Empfangen (RX)</p>
              <MetricChart data={rxPoints} color="cpu" unit="" domain={["auto", "auto"]} height={140} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Gesendet (TX)</p>
              <MetricChart data={txPoints} color="mem" unit="" domain={["auto", "auto"]} height={140} />
            </div>
            {selected && (
              <Link
                href={`/servers/${selected.serverId}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Zum Server
              </Link>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
