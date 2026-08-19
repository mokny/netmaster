"use client";

import { useEffect, useState } from "react";
import { MetricBar } from "@/components/dashboard/metric-bar";
import { Badge } from "@/components/ui/badge";
import { useLiveEvents } from "@/hooks/use-live-events";
import { VM_GENERIC_WARN, VM_GENERIC_CRIT } from "@/lib/thresholds";
import type { ProxmoxVmDTO } from "@/lib/types";

const RUNNING_STATES = new Set(["running"]);

function vmMemPercent(vm: ProxmoxVmDTO): number | null {
  if (vm.memUsedMb == null || !vm.memTotalMb) return null;
  return (vm.memUsedMb / vm.memTotalMb) * 100;
}

function vmDiskPercent(vm: ProxmoxVmDTO): number | null {
  if (vm.diskUsedGb == null || !vm.diskTotalGb) return null;
  return (vm.diskUsedGb / vm.diskTotalGb) * 100;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function ProxmoxHostWidget({
  serverId,
  aggregation = "weighted",
  showProblematic = false,
}: {
  serverId: string;
  aggregation?: "weighted" | "average";
  showProblematic?: boolean;
}) {
  const [vms, setVms] = useState<ProxmoxVmDTO[] | null>(null);

  useEffect(() => {
    fetch(`/api/servers/${serverId}/vms`)
      .then((res) => (res.ok ? res.json() : { vms: [] }))
      .then((data) => setVms(data.vms ?? []));
  }, [serverId]);

  useLiveEvents((event) => {
    if (event.type === "proxmox" && event.serverId === serverId) {
      setVms(event.vms as ProxmoxVmDTO[]);
    }
  });

  if (!vms) {
    return <p className="text-sm text-muted-foreground">Lädt…</p>;
  }

  const qemu = vms.filter((v) => v.type === "QEMU");
  const lxc = vms.filter((v) => v.type === "LXC");
  const running = vms.filter((v) => RUNNING_STATES.has(v.status));
  const stopped = vms.filter((v) => !RUNNING_STATES.has(v.status));

  let cpuPercent: number | null;
  let memPercent: number | null;
  let diskPercent: number | null;

  if (aggregation === "weighted") {
    const cpuValues = running.map((v) => v.cpuPercent).filter((v): v is number => v != null);
    cpuPercent = average(cpuValues);

    const memTotal = vms.reduce((sum, v) => sum + (v.memTotalMb ?? 0), 0);
    const memUsed = vms.reduce((sum, v) => sum + (v.memUsedMb ?? 0), 0);
    memPercent = memTotal > 0 ? (memUsed / memTotal) * 100 : null;

    const diskTotal = vms.reduce((sum, v) => sum + (v.diskTotalGb ?? 0), 0);
    const diskUsed = vms.reduce((sum, v) => sum + (v.diskUsedGb ?? 0), 0);
    diskPercent = diskTotal > 0 ? (diskUsed / diskTotal) * 100 : null;
  } else {
    const cpuValues = running.map((v) => v.cpuPercent).filter((v): v is number => v != null);
    cpuPercent = average(cpuValues);

    const memValues = vms.map(vmMemPercent).filter((v): v is number => v != null);
    memPercent = average(memValues);

    const diskValues = vms.map(vmDiskPercent).filter((v): v is number => v != null);
    diskPercent = average(diskValues);
  }

  const problematic = vms.filter(
    (v) =>
      !RUNNING_STATES.has(v.status) ||
      (v.cpuPercent != null && v.cpuPercent >= VM_GENERIC_CRIT) ||
      (vmMemPercent(v) != null && vmMemPercent(v)! >= VM_GENERIC_CRIT) ||
      (vmDiskPercent(v) != null && vmDiskPercent(v)! >= VM_GENERIC_CRIT)
  );

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 text-center text-xs">
        <div className="rounded-md border p-2">
          <p className="text-lg font-semibold">
            {qemu.filter((v) => RUNNING_STATES.has(v.status)).length}/{qemu.length}
          </p>
          <p className="text-muted-foreground">VMs laufend</p>
        </div>
        <div className="rounded-md border p-2">
          <p className="text-lg font-semibold">
            {lxc.filter((v) => RUNNING_STATES.has(v.status)).length}/{lxc.length}
          </p>
          <p className="text-muted-foreground">LXC laufend</p>
        </div>
      </div>

      <div className="space-y-2">
        <MetricBar label="CPU" value={cpuPercent} warn={VM_GENERIC_WARN} crit={VM_GENERIC_CRIT} />
        <MetricBar label="RAM" value={memPercent} warn={VM_GENERIC_WARN} crit={VM_GENERIC_CRIT} />
        <MetricBar label="Disk" value={diskPercent} warn={VM_GENERIC_WARN} crit={VM_GENERIC_CRIT} />
      </div>

      {showProblematic && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {problematic.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Alle {vms.length} VMs/LXC laufen unauffällig.
            </p>
          ) : (
            <ul className="space-y-1">
              {problematic.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between rounded-md px-2 py-1 text-sm"
                >
                  <span className="truncate">{v.name}</span>
                  <Badge variant={RUNNING_STATES.has(v.status) ? "default" : "secondary"} className="capitalize">
                    {v.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {stopped.length > 0 && !showProblematic && (
        <p className="text-xs text-muted-foreground">{stopped.length} gestoppt</p>
      )}
    </div>
  );
}
