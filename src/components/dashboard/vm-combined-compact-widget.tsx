"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { MetricBar } from "@/components/dashboard/metric-bar";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
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
  const t = useTranslations("common");
  const [vm, setVm] = useState<ProxmoxVmDTO | null>(null);
  const [polling, setPolling] = useState(false);

  const load = useCallback(() => {
    return fetch(`/api/servers/${serverId}/vms/${vmid}?hours=1`)
      .then((res) => (res.ok ? res.json() : { vm: null }))
      .then((data) => setVm(data.vm));
  }, [serverId, vmid]);

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
    const updated = (event.vms as ProxmoxVmDTO[]).find((v) => v.vmid === vmid);
    if (updated) setVm((prev) => (prev ? { ...prev, ...updated } : prev));
  });

  if (!vm) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }

  return (
    <div className="flex h-full min-w-0 flex-col justify-center gap-3">
      <div className="flex justify-end">
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
