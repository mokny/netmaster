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
import { NetworkChart, type NetworkChartPoint } from "@/components/network/network-chart";
import { formatBitRate, formatBytesGB } from "@/lib/format";
import type { MetricSampleDTO } from "@/lib/types";
import { useTranslations } from "next-intl";
import { usePollingEnabled } from "@/hooks/use-polling-enabled";

type TopologyNodeKind = "server" | "router" | "repeater" | "client";

interface TopologyNode {
  id: string;
  kind: TopologyNodeKind;
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

const KIND_COLORS: Record<TopologyNodeKind, string> = {
  server: "#3b82f6",
  router: "#16a34a",
  repeater: "#a855f7",
  client: "#64748b",
};

const KIND_ICONS: Record<TopologyNodeKind, string> = {
  server: "🖥️",
  router: "📡",
  repeater: "📶",
  client: "💻",
};

function layoutCircular(nodes: TopologyNode[], edges: TopologyEdge[]): Node[] {
  const parentOf = new Map<string, string>();
  for (const e of edges) {
    if (e.toServerId.startsWith("client:")) parentOf.set(e.toServerId, e.fromServerId);
  }

  // Client-Knoten werden nicht mit auf den Hauptkreis gelegt, sondern in der
  // Nähe ihres Router/Repeater-Elternknotens platziert - sonst wären Kanten
  // bei vielen Clients kaum noch zu unterscheiden.
  const hubNodes = nodes.filter((n) => n.kind !== "client");
  const clientNodes = nodes.filter((n) => n.kind === "client");

  const radius = Math.max(160, hubNodes.length * 50);
  const cx = radius + 220;
  const cy = radius + 220;

  const hubAngle = new Map<string, number>();
  const hubPosition = new Map<string, { x: number; y: number }>();
  const positions: Node[] = hubNodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(hubNodes.length, 1);
    hubAngle.set(n.id, angle);
    const pos = { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
    hubPosition.set(n.id, pos);
    return {
      id: n.id,
      position: pos,
      data: { label: `${KIND_ICONS[n.kind]} ${n.name}` },
      style: {
        background: n.status === "error" ? "#ef4444" : KIND_COLORS[n.kind],
        color: "white",
        borderRadius: 8,
        fontSize: 12,
        padding: 8,
      },
    };
  });

  const clientsByParent = new Map<string, TopologyNode[]>();
  for (const n of clientNodes) {
    const parent = parentOf.get(n.id);
    const key = parent && hubPosition.has(parent) ? parent : "__unassigned";
    const list = clientsByParent.get(key) ?? [];
    list.push(n);
    clientsByParent.set(key, list);
  }

  for (const [parentId, children] of clientsByParent) {
    const baseAngle = hubAngle.get(parentId) ?? 0;
    const parentPos = hubPosition.get(parentId) ?? { x: cx, y: cy };
    const clientRadius = 90;
    const spread = Math.min(Math.PI / 2, 0.35 * children.length);
    children.forEach((n, i) => {
      const offset = children.length > 1 ? -spread / 2 + (spread * i) / (children.length - 1) : 0;
      const angle = baseAngle + offset;
      positions.push({
        id: n.id,
        position: {
          x: parentPos.x + clientRadius * Math.cos(angle),
          y: parentPos.y + clientRadius * Math.sin(angle),
        },
        data: { label: `${KIND_ICONS[n.kind]} ${n.name}` },
        style: {
          background: n.status === "error" ? "#ef4444" : KIND_COLORS[n.kind],
          color: "white",
          borderRadius: 8,
          fontSize: 11,
          padding: 6,
          opacity: 0.9,
        },
      });
    });
  }

  return positions;
}

export function TopologyGraph() {
  const t = useTranslations("network.topologyGraph");
  const tErrors = useTranslations("errors");
  const [nodes, setNodes] = useState<TopologyNode[] | null>(null);
  const [edges, setEdges] = useState<TopologyEdge[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TopologyNode | null>(null);
  const [samples, setSamples] = useState<MetricSampleDTO[]>([]);
  const pollingEnabled = usePollingEnabled("topologyGraphEnabled");

  useEffect(() => {
    if (!pollingEnabled) return;
    let stopped = false;
    async function load() {
      try {
        const res = await fetch("/api/network/topology");
        const data = await res.json().catch(() => ({}));
        if (stopped) return;
        if (!res.ok) {
          setError(data.error ? tErrors(data.error) : t("fetchError"));
          return;
        }
        setNodes(data.nodes);
        setEdges(data.edges);
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
  }, [pollingEnabled]);

  useEffect(() => {
    if (!selected || selected.kind !== "server") return;
    let stopped = false;
    fetch(`/api/servers/${selected.id}/metrics?hours=6`)
      .then((res) => res.json())
      .then((data) => {
        if (!stopped) setSamples(data.samples ?? []);
      })
      .catch(() => {});
    return () => {
      stopped = true;
    };
  }, [selected]);

  const flowNodes = useMemo(() => layoutCircular(nodes ?? [], edges), [nodes, edges]);
  const maxCount = Math.max(1, ...edges.map((e) => e.connectionCount));
  const flowEdges: Edge[] = useMemo(
    () =>
      edges.map((e) => {
        const isClientEdge = e.toServerId.startsWith("client:");
        return {
          id: `${e.fromServerId}-${e.toServerId}`,
          source: e.fromServerId,
          target: e.toServerId,
          label: isClientEdge ? undefined : t("connectionCount", { count: e.connectionCount }),
          style: { strokeWidth: isClientEdge ? 1.5 : 1 + (e.connectionCount / maxCount) * 6 },
          animated: !isClientEdge,
        };
      }),
    [edges, maxCount]
  );

  const cumulativePoints: NetworkChartPoint[] = samples.map((s) => ({
    timestamp: s.timestamp,
    rx: s.netRxBytes,
    tx: s.netTxBytes,
  }));

  // Rate = Delta der kumulativen Zähler / Delta der Zeit zwischen zwei Samples.
  // Ein negatives Delta bedeutet, der Zähler wurde zurückgesetzt (z.B. Reboot) –
  // in dem Fall wird kein Rate-Punkt berechnet, statt einen falschen Ausreißer zu zeigen.
  const ratePoints: NetworkChartPoint[] = samples.slice(1).map((s, i) => {
    const prev = samples[i];
    const deltaSec = (new Date(s.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000;
    const rateFor = (curr: number | null, prevVal: number | null) => {
      if (curr === null || prevVal === null || deltaSec <= 0) return null;
      const delta = curr - prevVal;
      if (delta < 0) return null;
      return delta / deltaSec;
    };
    return {
      timestamp: s.timestamp,
      rx: rateFor(s.netRxBytes, prev.netRxBytes),
      tx: rateFor(s.netTxBytes, prev.netTxBytes),
    };
  });

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-500">{error}</p>}
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
      <div className="h-[600px] w-full overflow-hidden rounded-md border">
        {!nodes ? (
          <p className="p-4 text-sm text-muted-foreground">{t("loading")}</p>
        ) : nodes.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            fitView
            colorMode="system"
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_, node) => {
              const found = nodes.find((n) => n.id === node.id);
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
                ? t("errorPrefix", { error: selected.error ?? "" })
                : selected?.kind === "server"
                  ? t("throughputLast6h")
                  : selected?.addresses[0]}
            </SheetDescription>
          </SheetHeader>
          {selected?.kind === "server" ? (
            <div className="space-y-4 px-4 pb-4">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {t("throughputRate")}
                </p>
                <NetworkChart data={ratePoints} formatValue={formatBitRate} height={140} />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {t("cumulativeVolume")}
                </p>
                <NetworkChart data={cumulativePoints} formatValue={formatBytesGB} height={140} />
              </div>
              <Link
                href={`/servers/${selected.id}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {t("goToServer")}
              </Link>
            </div>
          ) : (
            selected && (
              <div className="space-y-4 px-4 pb-4">
                {selected.kind !== "client" && (
                  <Link
                    href="/router"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    {t("goToRouter")}
                  </Link>
                )}
              </div>
            )
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
