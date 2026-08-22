"use client";

import { useEffect, useState } from "react";
import {
  CombinedMetricChart,
  DISK_KEY_PREFIX,
  type CombinedPoint,
} from "@/components/servers/combined-metric-chart";
import { ChartTimeToolbar } from "@/components/charts/chart-time-toolbar";
import { ChartPanOverlay } from "@/components/charts/chart-pan-overlay";
import { useChartTimeWindow } from "@/hooks/use-chart-time-window";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useLiveEvents } from "@/hooks/use-live-events";
import type { ProxmoxVmDTO, ProxmoxVmSampleDTO } from "@/lib/types";

const DISK_KEY = `${DISK_KEY_PREFIX}disk`;

export function VmCombinedChartWidget({
  serverId,
  vmid,
}: {
  serverId: string;
  vmid: number;
}) {
  const [samples, setSamples] = useState<ProxmoxVmSampleDTO[]>([]);
  const chartWindow = useChartTimeWindow();
  const debouncedFrom = useDebouncedValue(chartWindow.from, 250);
  const debouncedTo = useDebouncedValue(chartWindow.to, 250);

  useEffect(() => {
    fetch(`/api/servers/${serverId}/vms/${vmid}?from=${debouncedFrom}&to=${debouncedTo}`)
      .then((res) => (res.ok ? res.json() : { samples: [] }))
      .then((data) => setSamples(data.samples ?? []));
  }, [serverId, vmid, debouncedFrom, debouncedTo]);

  useLiveEvents((event) => {
    if (event.type !== "proxmox" || event.serverId !== serverId) return;
    const updated = (event.vms as (ProxmoxVmDTO & { sample?: ProxmoxVmSampleDTO })[]).find(
      (v) => v.vmid === vmid
    );
    if (updated?.sample && chartWindow.isLive) {
      setSamples((prev) => [...prev, updated.sample!].slice(-2000));
    }
  });

  const data: CombinedPoint[] = samples.map((s) => ({
    timestamp: s.timestamp,
    cpuPercent: s.cpuPercent,
    memPercent: s.memPercent,
    [DISK_KEY]: s.diskPercent,
  }));

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-1">
      <div className="flex shrink-0 justify-end">
        <ChartTimeToolbar window={chartWindow} compact />
      </div>
      <ChartPanOverlay
        windowMs={chartWindow.windowMs}
        onPanBy={chartWindow.panBy}
        className="min-h-0 flex-1"
      >
        <CombinedMetricChart
          data={data}
          diskLines={[{ key: DISK_KEY, label: "Disk" }]}
          height="100%"
        />
      </ChartPanOverlay>
    </div>
  );
}
