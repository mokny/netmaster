"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
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
import { FileManagerTab } from "@/components/servers/file-manager/file-manager-tab";
import {
  CombinedMetricChart,
  DISK_KEY_PREFIX,
  type CombinedPoint,
} from "@/components/servers/combined-metric-chart";
import { ChartTimeToolbar } from "@/components/charts/chart-time-toolbar";
import { ChartPanOverlay } from "@/components/charts/chart-pan-overlay";
import { useChartTimeWindow } from "@/hooks/use-chart-time-window";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLiveEvents } from "@/hooks/use-live-events";
import { useSession } from "@/hooks/use-session";
import { useDetailPresence } from "@/hooks/use-detail-presence";
import { ArrowLeft, Play, Square, RotateCw, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { ProxmoxVmDTO, ProxmoxVmSampleDTO } from "@/lib/types";

interface VmWithServer extends ProxmoxVmDTO {
  server: { id: string; name: string };
}

export function VmDetail({ serverId, vmid }: { serverId: string; vmid: number }) {
  const t = useTranslations("vms.detail");
  const session = useSession();
  const canControl = session?.role === "EDITOR" || session?.role === "ADMIN";

  const [vm, setVm] = useState<VmWithServer | null>(null);
  const [samples, setSamples] = useState<ProxmoxVmSampleDTO[]>([]);
  const [ping, setPing] = useState<{ alive: boolean; latencyMs: number | null } | null>(null);
  const [refreshingIp, setRefreshingIp] = useState(false);
  const [polling, setPolling] = useState(false);

  useDetailPresence(serverId, "proxmox");

  const chartWindow = useChartTimeWindow();
  const debouncedFrom = useDebouncedValue(chartWindow.from, 250);
  const debouncedTo = useDebouncedValue(chartWindow.to, 250);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/servers/${serverId}/vms/${vmid}?from=${debouncedFrom}&to=${debouncedTo}`
    );
    if (res.ok) {
      const data = await res.json();
      setVm(data.vm);
      setSamples(data.samples);
    }
  }, [serverId, vmid, debouncedFrom, debouncedTo]);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch(
        `/api/servers/${serverId}/vms/${vmid}?from=${debouncedFrom}&to=${debouncedTo}`
      );
      if (!active || !res.ok) return;
      const data = await res.json();
      setVm(data.vm);
      setSamples(data.samples);
    })();
    return () => {
      active = false;
    };
  }, [serverId, vmid, debouncedFrom, debouncedTo]);

  useLiveEvents((event) => {
    if (event.type !== "proxmox" || event.serverId !== serverId) return;
    const updated = (event.vms as (ProxmoxVmDTO & { sample?: ProxmoxVmSampleDTO })[]).find(
      (v) => v.vmid === vmid
    );
    if (!updated) return;
    setVm((prev) => (prev ? { ...prev, ...updated, server: prev.server } : prev));
    if (updated.sample && chartWindow.isLive) {
      setSamples((prev) => [...prev, updated.sample!].slice(-2000));
    }
  });

  useLiveEvents((event) => {
    if (event.type !== "ping" || event.kind !== "vm" || event.serverId !== serverId) return;
    if (event.vmid !== vmid) return;
    setPing({ alive: event.alive, latencyMs: event.latencyMs });
  });

  async function refreshIp() {
    setRefreshingIp(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/vms/${vmid}/refresh-ip`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setVm((prev) => (prev ? { ...prev, ips: data.ips } : prev));
      }
    } finally {
      setRefreshingIp(false);
    }
  }

  async function pollNow() {
    setPolling(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/vms/poll-now`, { method: "POST" });
      if (res.ok) await load();
      else toast.error(t("pollFailed"));
    } finally {
      setPolling(false);
    }
  }

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
              <span className="text-sm text-muted-foreground">
                {vm.ips.length > 0 ? vm.ips.join(", ") : t("ipUnknown")}
              </span>
              {vm.ips.length > 0 && (
                <Badge variant={ping === null ? "outline" : ping.alive ? "default" : "destructive"}>
                  {ping === null
                    ? t("pingChecking")
                    : ping.alive
                      ? `${t("pingAlive")}${ping.latencyMs != null ? ` · ${ping.latencyMs}ms` : ""}`
                      : t("pingUnreachable")}
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                disabled={refreshingIp}
                onClick={refreshIp}
                title={t("refreshIp")}
              >
                <RefreshCw className={`size-3.5 ${refreshingIp ? "animate-spin" : ""}`} />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              #{vm.vmid} · {vm.type === "QEMU" ? "VM" : "LXC"} {t("on")}{" "}
              <Link href={`/servers/${vm.server.id}`} className="hover:underline">
                {vm.server.name}
              </Link>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={polling} onClick={pollNow}>
            <RefreshCw className={`size-4 ${polling ? "animate-spin" : ""}`} />
            {t("pollNow")}
          </Button>
          {canControl && (
            <>
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
                    {t("start")}
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
                      {t("restart")}
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
                      {t("stop")}
                    </Button>
                  }
                />
              </>
            )}
            </>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t("overview")}</TabsTrigger>
          <TabsTrigger value="snapshots">Snapshots</TabsTrigger>
          <TabsTrigger value="backups">Backups</TabsTrigger>
          {canControl && running && <TabsTrigger value="files">{t("files")}</TabsTrigger>}
        </TabsList>
        <TabsContent value="overview">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <div>
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
              </div>
              <ChartTimeToolbar window={chartWindow} />
            </CardHeader>
            <CardContent>
              <ChartPanOverlay windowMs={chartWindow.windowMs} onPanBy={chartWindow.panBy}>
                <CombinedMetricChart
                  data={chartData}
                  diskLines={[{ key: `${DISK_KEY_PREFIX}disk`, label: "Disk" }]}
                />
              </ChartPanOverlay>
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
        {canControl && running && (
          <TabsContent value="files">
            <FileManagerTab
              wsPath={`/api/ws/proxmox-files?serverId=${encodeURIComponent(serverId)}&vmid=${vmid}`}
              restBasePath={`/api/proxmox/${serverId}/${vmid}/files`}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
