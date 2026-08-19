"use client";

import { useEffect, useState } from "react";
import {
  CombinedMetricChart,
  DISK_KEY_PREFIX,
  type CombinedPoint,
} from "@/components/servers/combined-metric-chart";
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

  useEffect(() => {
    fetch(`/api/servers/${serverId}/vms/${vmid}?hours=6`)
      .then((res) => (res.ok ? res.json() : { samples: [] }))
      .then((data) => setSamples(data.samples ?? []));
  }, [serverId, vmid]);

  useLiveEvents((event) => {
    if (event.type !== "proxmox" || event.serverId !== serverId) return;
    const updated = (event.vms as (ProxmoxVmDTO & { sample?: ProxmoxVmSampleDTO })[]).find(
      (v) => v.vmid === vmid
    );
    if (updated?.sample) {
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
    <div className="h-full min-h-0">
      <CombinedMetricChart
        data={data}
        diskLines={[{ key: DISK_KEY, label: "Disk" }]}
        height="100%"
      />
    </div>
  );
}
