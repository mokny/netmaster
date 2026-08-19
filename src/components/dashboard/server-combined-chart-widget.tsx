"use client";

import { useEffect, useState } from "react";
import {
  CombinedMetricChart,
  DISK_KEY_PREFIX,
  type CombinedPoint,
} from "@/components/servers/combined-metric-chart";
import { useLiveEvents } from "@/hooks/use-live-events";
import type { MetricSampleDTO } from "@/lib/types";

const DISK_KEY = `${DISK_KEY_PREFIX}root`;

export function ServerCombinedChartWidget({ serverId }: { serverId: string }) {
  const [samples, setSamples] = useState<MetricSampleDTO[]>([]);

  useEffect(() => {
    fetch(`/api/servers/${serverId}/metrics?hours=3`)
      .then((res) => (res.ok ? res.json() : { samples: [] }))
      .then((data) => setSamples(data.samples ?? []));
  }, [serverId]);

  useLiveEvents((event) => {
    if (event.type === "metric" && event.serverId === serverId) {
      setSamples((prev) =>
        [...prev, event.sample as unknown as MetricSampleDTO].slice(-200)
      );
    }
  });

  const data: CombinedPoint[] = samples.map((s) => ({
    timestamp: s.timestamp,
    cpuPercent: s.cpuPercent,
    memPercent: s.memPercent,
    [DISK_KEY]: s.diskPercent,
  }));

  return (
    <div className="h-full min-h-0">
      <CombinedMetricChart
        data={data}
        diskLines={[{ key: DISK_KEY, label: "Disk" }]}
        height="100%"
      />
    </div>
  );
}
