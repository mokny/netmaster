"use client";

import { useEffect, useState } from "react";
import { MetricChart, type ChartPoint } from "@/components/servers/metric-chart";
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

  useEffect(() => {
    fetch(`/api/servers/${serverId}/metrics?hours=3`)
      .then((res) => (res.ok ? res.json() : { samples: [] }))
      .then((data) => setSamples(data.samples));
  }, [serverId]);

  useLiveEvents((event) => {
    if (event.type === "metric" && event.serverId === serverId) {
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
    <div className="flex h-full flex-col">
      <p className="mb-1 text-2xl font-semibold">
        {latest != null ? `${latest.toFixed(1)}%` : "–"}
      </p>
      <div className="min-h-0 flex-1">
        <MetricChart data={points} color={meta.color} height="100%" />
      </div>
    </div>
  );
}
