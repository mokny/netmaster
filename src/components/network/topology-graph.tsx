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
        label: t("connectionCount", { count: e.connectionCount }),
        style: { strokeWidth: 1 + (e.connectionCount / maxCount) * 6 },
        animated: true,
      })),
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
                ? t("errorPrefix", { error: selected.error ?? "" })
                : t("throughputLast6h")}
            </SheetDescription>
          </SheetHeader>
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
            {selected && (
              <Link
                href={`/servers/${selected.serverId}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {t("goToServer")}
              </Link>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
