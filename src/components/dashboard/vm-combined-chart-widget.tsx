"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CombinedMetricChart,
  DISK_KEY_PREFIX,
  type CombinedPoint,
} from "@/components/servers/combined-metric-chart";
import { ChartTimeToolbar } from "@/components/charts/chart-time-toolbar";
import { ChartPanOverlay } from "@/components/charts/chart-pan-overlay";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
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
  const t = useTranslations("common");
  const [samples, setSamples] = useState<ProxmoxVmSampleDTO[]>([]);
  const [polling, setPolling] = useState(false);
  const chartWindow = useChartTimeWindow();
  const debouncedFrom = useDebouncedValue(chartWindow.from, 250);
  const debouncedTo = useDebouncedValue(chartWindow.to, 250);

  const load = useCallback(() => {
    return fetch(`/api/servers/${serverId}/vms/${vmid}?from=${debouncedFrom}&to=${debouncedTo}`)
      .then((res) => (res.ok ? res.json() : { samples: [] }))
      .then((data) => setSamples(data.samples ?? []));
  }, [serverId, vmid, debouncedFrom, debouncedTo]);

  useEffect(() => {
    void load();
  }, [load]);

  async function pollNow() {
    setPolling(true);
    try {
      await fetch(`/api/servers/${serverId}/vms/poll-now`, { method: "POST" });
      await load();
    } finally {
      setPolling(false);
    }
  }

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
