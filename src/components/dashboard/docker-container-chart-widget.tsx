"use client";

import { useEffect, useState } from "react";
import { MetricChart, type ChartPoint } from "@/components/servers/metric-chart";
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

  useEffect(() => {
    fetch(`/api/servers/${serverId}/containers/${containerId}?hours=6`)
      .then((res) => (res.ok ? res.json() : { samples: [] }))
      .then((data) => setSamples(data.samples ?? []));
  }, [serverId, containerId]);

  useLiveEvents((event) => {
    if (event.type !== "docker" || event.serverId !== serverId) return;
    const updated = (event.containers as ContainerSnapshotDTO[]).find(
      (c) => c.containerId === containerId
    );
    if (!updated) return;
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
      <div className="min-h-0 flex-1">
        <MetricChart data={cpuPoints} color="cpu" unit="%" height="100%" />
      </div>
      <div className="min-h-0 flex-1">
        <MetricChart data={memPoints} color="mem" unit="MB" domain={["auto", "auto"]} height="100%" />
      </div>
    </div>
  );
}
