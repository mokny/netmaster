"use client";

import { useEffect, useState } from "react";
import { MetricBar } from "@/components/dashboard/metric-bar";
import { useLiveEvents } from "@/hooks/use-live-events";
import { VM_GENERIC_WARN, VM_GENERIC_CRIT } from "@/lib/thresholds";
import type { ProxmoxVmDTO } from "@/lib/types";

function vmDiskPercent(vm: ProxmoxVmDTO): number | null {
  if (vm.diskUsedGb == null || !vm.diskTotalGb) return null;
  return (vm.diskUsedGb / vm.diskTotalGb) * 100;
}

function vmMemPercent(vm: ProxmoxVmDTO): number | null {
  if (vm.memUsedMb == null || !vm.memTotalMb) return null;
  return (vm.memUsedMb / vm.memTotalMb) * 100;
}

export function VmCombinedCompactWidget({
  serverId,
  vmid,
}: {
  serverId: string;
  vmid: number;
}) {
  const [vm, setVm] = useState<ProxmoxVmDTO | null>(null);

  useEffect(() => {
    fetch(`/api/servers/${serverId}/vms/${vmid}?hours=1`)
      .then((res) => (res.ok ? res.json() : { vm: null }))
      .then((data) => setVm(data.vm));
  }, [serverId, vmid]);

  useLiveEvents((event) => {
    if (event.type !== "proxmox" || event.serverId !== serverId) return;
    const updated = (event.vms as ProxmoxVmDTO[]).find((v) => v.vmid === vmid);
    if (updated) setVm((prev) => (prev ? { ...prev, ...updated } : prev));
  });

  if (!vm) {
    return <p className="text-sm text-muted-foreground">Lädt…</p>;
  }

  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <MetricBar label="CPU" value={vm.cpuPercent} warn={VM_GENERIC_WARN} crit={VM_GENERIC_CRIT} />
      <MetricBar
        label="RAM"
        value={vmMemPercent(vm)}
        warn={VM_GENERIC_WARN}
        crit={VM_GENERIC_CRIT}
      />
      <MetricBar
        label="Disk"
        value={vmDiskPercent(vm)}
        warn={VM_GENERIC_WARN}
        crit={VM_GENERIC_CRIT}
      />
    </div>
  );
}
