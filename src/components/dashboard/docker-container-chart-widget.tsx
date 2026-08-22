"use client";

import { useEffect, useState } from "react";
import { MetricChart, type ChartPoint } from "@/components/servers/metric-chart";
import { ChartTimeToolbar } from "@/components/charts/chart-time-toolbar";
import { ChartPanOverlay } from "@/components/charts/chart-pan-overlay";
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
  const [samples, setSamples] = useState<ContainerSample[]>([]);
  const chartWindow = useChartTimeWindow();
  const debouncedFrom = useDebouncedValue(chartWindow.from, 250);
  const debouncedTo = useDebouncedValue(chartWindow.to, 250);

  useEffect(() => {
    fetch(`/api/servers/${serverId}/containers/${containerId}?from=${debouncedFrom}&to=${debouncedTo}`)
      .then((res) => (res.ok ? res.json() : { samples: [] }))
      .then((data) => setSamples(data.samples ?? []));
  }, [serverId, containerId, debouncedFrom, debouncedTo]);

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
      <div className="flex shrink-0 justify-end">
        <ChartTimeToolbar window={chartWindow} compact />
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
