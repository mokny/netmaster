"use client";

import { useEffect, useState } from "react";
import { MetricChart, type ChartPoint } from "@/components/servers/metric-chart";
import { ChartTimeToolbar } from "@/components/charts/chart-time-toolbar";
import { ChartPanOverlay } from "@/components/charts/chart-pan-overlay";
import { useChartTimeWindow } from "@/hooks/use-chart-time-window";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useLiveEvents } from "@/hooks/use-live-events";
import type { MetricSampleDTO } from "@/lib/types";

const METRIC_LABELS: Record<string, { label: string; color: "cpu" | "mem" | "disk" }> = {
  cpuPercent: { label: "CPU", color: "cpu" },
  memPercent: { label: "RAM", color: "mem" },
  diskPercent: { label: "Disk", color: "disk" },
};

export function ServerMetricWidget({
  serverId,
  metric,
}: {
  serverId: string;
  metric: string;
}) {
  const [samples, setSamples] = useState<MetricSampleDTO[]>([]);
  const meta = METRIC_LABELS[metric] ?? METRIC_LABELS.cpuPercent;
  const chartWindow = useChartTimeWindow();
  const debouncedFrom = useDebouncedValue(chartWindow.from, 250);
  const debouncedTo = useDebouncedValue(chartWindow.to, 250);

  useEffect(() => {
    fetch(`/api/servers/${serverId}/metrics?from=${debouncedFrom}&to=${debouncedTo}`)
      .then((res) => (res.ok ? res.json() : { samples: [] }))
      .then((data) => setSamples(data.samples));
  }, [serverId, debouncedFrom, debouncedTo]);

  useLiveEvents((event) => {
    if (event.type === "metric" && event.serverId === serverId && chartWindow.isLive) {
      setSamples((prev) =>
        [...prev, event.sample as unknown as MetricSampleDTO].slice(-200)
      );
    }
  });

  const points: ChartPoint[] = samples.map((s) => ({
    timestamp: s.timestamp,
    value:
      typeof s[metric as keyof MetricSampleDTO] === "number"
        ? (s[metric as keyof MetricSampleDTO] as number)
        : null,
  }));

  const latest = points.at(-1)?.value;

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="truncate text-2xl font-semibold">
          {latest != null ? `${latest.toFixed(1)}%` : "–"}
        </p>
        <ChartTimeToolbar window={chartWindow} compact />
      </div>
      <ChartPanOverlay
        windowMs={chartWindow.windowMs}
        onPanBy={chartWindow.panBy}
        className="min-h-0 min-w-0 flex-1"
      >
        <MetricChart data={points} color={meta.color} height="100%" />
      </ChartPanOverlay>
    </div>
  );
}
