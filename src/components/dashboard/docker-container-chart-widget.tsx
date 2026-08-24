"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MetricChart, type ChartPoint } from "@/components/servers/metric-chart";
import { ChartTimeToolbar } from "@/components/charts/chart-time-toolbar";
import { ChartPanOverlay } from "@/components/charts/chart-pan-overlay";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useChartTimeWindow } from "@/hooks/use-chart-time-window";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useLiveEvents } from "@/hooks/use-live-events";
import type { ContainerSnapshotDTO } from "@/lib/types";

interface ContainerSample {
  timestamp: string;
  cpuPercent: number | null;
  memUsageMb: number | null;
}

export function DockerContainerChartWidget({
  serverId,
  containerId,
}: {
  serverId: string;
  containerId: string;
}) {
  const t = useTranslations("common");
  const [samples, setSamples] = useState<ContainerSample[]>([]);
  const [polling, setPolling] = useState(false);
  const chartWindow = useChartTimeWindow();
  const debouncedFrom = useDebouncedValue(chartWindow.from, 250);
  const debouncedTo = useDebouncedValue(chartWindow.to, 250);

  const load = useCallback(() => {
    return fetch(`/api/servers/${serverId}/containers/${containerId}?from=${debouncedFrom}&to=${debouncedTo}`)
      .then((res) => (res.ok ? res.json() : { samples: [] }))
      .then((data) => setSamples(data.samples ?? []));
  }, [serverId, containerId, debouncedFrom, debouncedTo]);

  useEffect(() => {
    void load();
  }, [load]);

  async function pollNow() {
    setPolling(true);
    try {
      await fetch(`/api/servers/${serverId}/containers/poll-now`, { method: "POST" });
      await load();
    } finally {
      setPolling(false);
    }
  }

  useLiveEvents((event) => {
    if (event.type !== "docker" || event.serverId !== serverId) return;
    const updated = (event.containers as ContainerSnapshotDTO[]).find(
      (c) => c.containerId === containerId
    );
    if (!updated || !chartWindow.isLive) return;
    setSamples((prev) =>
      [
        ...prev,
        {
          timestamp: new Date().toISOString(),
          cpuPercent: updated.cpuPercent,
          memUsageMb: updated.memUsageMb,
        },
      ].slice(-2000)
    );
  });

  const cpuPoints: ChartPoint[] = samples.map((s) => ({
    timestamp: s.timestamp,
    value: s.cpuPercent,
  }));
  const memPoints: ChartPoint[] = samples.map((s) => ({
    timestamp: s.timestamp,
    value: s.memUsageMb,
  }));

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-end gap-1">
        <ChartTimeToolbar window={chartWindow} compact />
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          disabled={polling}
          onClick={pollNow}
          aria-label={t("refresh")}
        >
          <RefreshCw className={`size-3.5 ${polling ? "animate-spin" : ""}`} />
        </Button>
      </div>
      <ChartPanOverlay windowMs={chartWindow.windowMs} onPanBy={chartWindow.panBy} className="min-h-0 flex-1">
        <MetricChart data={cpuPoints} color="cpu" unit="%" height="100%" />
      </ChartPanOverlay>
      <ChartPanOverlay windowMs={chartWindow.windowMs} onPanBy={chartWindow.panBy} className="min-h-0 flex-1">
        <MetricChart data={memPoints} color="mem" unit="MB" domain={["auto", "auto"]} height="100%" />
      </ChartPanOverlay>
    </div>
  );
}
