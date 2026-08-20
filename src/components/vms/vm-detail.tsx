"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { VmPowerDialog } from "@/components/vms/vm-power-dialog";
import { VmTerminalMenu } from "@/components/vms/vm-terminal-menu";
import { VmSnapshotsTab } from "@/components/vms/vm-snapshots-tab";
import { VmBackupsTab } from "@/components/vms/vm-backups-tab";
import {
  CombinedMetricChart,
  DISK_KEY_PREFIX,
  type CombinedPoint,
} from "@/components/servers/combined-metric-chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLiveEvents } from "@/hooks/use-live-events";
import { useSession } from "@/hooks/use-session";
import { ArrowLeft, Play, Square, RotateCw } from "lucide-react";
import type { ProxmoxVmDTO, ProxmoxVmSampleDTO } from "@/lib/types";

interface VmWithServer extends ProxmoxVmDTO {
  server: { id: string; name: string };
}

export function VmDetail({ serverId, vmid }: { serverId: string; vmid: number }) {
  const session = useSession();
  const canControl = session?.role === "EDITOR" || session?.role === "ADMIN";

  const [vm, setVm] = useState<VmWithServer | null>(null);
  const [samples, setSamples] = useState<ProxmoxVmSampleDTO[]>([]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/servers/${serverId}/vms/${vmid}?hours=6`);
    if (res.ok) {
      const data = await res.json();
      setVm(data.vm);
      setSamples(data.samples);
    }
  }, [serverId, vmid]);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch(`/api/servers/${serverId}/vms/${vmid}?hours=6`);
      if (!active || !res.ok) return;
      const data = await res.json();
      setVm(data.vm);
      setSamples(data.samples);
    })();
    return () => {
      active = false;
    };
  }, [serverId, vmid]);

  useLiveEvents((event) => {
    if (event.type !== "proxmox" || event.serverId !== serverId) return;
    const updated = (event.vms as (ProxmoxVmDTO & { sample?: ProxmoxVmSampleDTO })[]).find(
      (v) => v.vmid === vmid
    );
    if (!updated) return;
    setVm((prev) => (prev ? { ...prev, ...updated, server: prev.server } : prev));
    if (updated.sample) {
      setSamples((prev) => [...prev, updated.sample!].slice(-2000));
    }
  });

  const chartData: CombinedPoint[] = useMemo(
    () =>
      samples.map((s) => ({
        timestamp: s.timestamp,
        cpuPercent: s.cpuPercent,
        memPercent: s.memPercent,
        [`${DISK_KEY_PREFIX}disk`]: s.diskPercent,
      })),
    [samples]
  );

  if (!vm) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const running = vm.status === "running";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/servers/${serverId}`}
            className={buttonVariants({ variant: "ghost", size: "icon" })}
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{vm.name}</h1>
              <Badge variant={running ? "default" : "secondary"} className="capitalize">
                {vm.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              #{vm.vmid} · {vm.type === "QEMU" ? "VM" : "LXC"} auf{" "}
              <Link href={`/servers/${vm.server.id}`} className="hover:underline">
                {vm.server.name}
              </Link>
            </p>
          </div>
        </div>
        {canControl && (
          <div className="flex flex-wrap items-center gap-2">
            {running && (
              <VmTerminalMenu
                serverId={serverId}
                vmid={vmid}
                vmName={vm.name}
                vmType={vm.type}
                size="sm"
              />
            )}
            {!running && (
              <VmPowerDialog
                serverId={serverId}
                vmid={vmid}
                vmName={vm.name}
                action="start"
                onDone={load}
                trigger={
                  <Button variant="outline" size="sm">
                    <Play className="size-4" />
                    Starten
                  </Button>
                }
              />
            )}
            {running && (
              <>
                <VmPowerDialog
                  serverId={serverId}
                  vmid={vmid}
                  vmName={vm.name}
                  action="reboot"
                  onDone={load}
                  trigger={
                    <Button variant="outline" size="sm">
                      <RotateCw className="size-4" />
                      Neu starten
                    </Button>
                  }
                />
                <VmPowerDialog
                  serverId={serverId}
                  vmid={vmid}
                  vmName={vm.name}
                  action="stop"
                  onDone={load}
                  trigger={
                    <Button variant="outline" size="sm">
                      <Square className="size-4" />
                      Stoppen
                    </Button>
                  }
                />
              </>
            )}
          </div>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="snapshots">Snapshots</TabsTrigger>
          <TabsTrigger value="backups">Backups</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>CPU / RAM / Disk</CardTitle>
              <CardDescription>
                CPU {vm.cpuPercent != null ? `${vm.cpuPercent.toFixed(1)}%` : "–"} · RAM{" "}
                {vm.memUsedMb != null && vm.memTotalMb
                  ? `${(vm.memUsedMb / 1024).toFixed(1)} / ${(vm.memTotalMb / 1024).toFixed(1)} GB`
                  : "–"}
                {vm.diskUsedGb != null && vm.diskTotalGb
                  ? ` · Disk ${vm.diskUsedGb.toFixed(1)} / ${vm.diskTotalGb.toFixed(1)} GB`
                  : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CombinedMetricChart
                data={chartData}
                diskLines={[{ key: `${DISK_KEY_PREFIX}disk`, label: "Disk" }]}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="snapshots">
          <VmSnapshotsTab
            serverId={serverId}
            vmid={vmid}
            vmType={vm.type}
            canControl={canControl}
          />
        </TabsContent>
        <TabsContent value="backups">
          <VmBackupsTab serverId={serverId} vmid={vmid} canControl={canControl} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
