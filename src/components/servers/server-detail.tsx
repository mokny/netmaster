"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import {
  CombinedMetricChart,
  DISK_KEY_PREFIX,
  type CombinedPoint,
} from "@/components/servers/combined-metric-chart";
import { DiskSelect } from "@/components/servers/disk-select";
import { ServiceCheckDialog } from "@/components/servers/service-check-dialog";
import { ServerFormDialog } from "@/components/servers/server-form-dialog";
import { ProcessManagerCard } from "@/components/servers/process-manager-card";
import { PowerActionDialog } from "@/components/servers/power-action-dialog";
import { FileManagerTab } from "@/components/servers/file-manager/file-manager-tab";
import { VmRow } from "@/components/vms/vm-row";
import { useLiveEvents } from "@/hooks/use-live-events";
import { useSession } from "@/hooks/use-session";
import { useTerminalManager } from "@/hooks/use-terminal-manager";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ArrowLeft, Trash2, Pencil, Container, TerminalSquare, RotateCw, Power, Cpu, Boxes } from "lucide-react";
import type {
  ServerDTO,
  MetricSampleDTO,
  DiskSampleDTO,
  DiskInfoDTO,
  ServiceCheckDTO,
  ContainerSnapshotDTO,
  ProxmoxVmDTO,
} from "@/lib/types";

export function ServerDetail({ serverId }: { serverId: string }) {
  const router = useRouter();
  const session = useSession();
  const confirm = useConfirm();
  const canEdit = session?.role === "EDITOR" || session?.role === "ADMIN";
  const canDelete = session?.role === "ADMIN";
  const { openTerminal } = useTerminalManager();

  const [server, setServer] = useState<ServerDTO | null>(null);
  const [samples, setSamples] = useState<MetricSampleDTO[]>([]);
  const [diskSamples, setDiskSamples] = useState<DiskSampleDTO[]>([]);
  const [disks, setDisks] = useState<DiskInfoDTO[]>([]);
  const [selectedMounts, setSelectedMounts] = useState<string[] | null>(null);
  const [checks, setChecks] = useState<ServiceCheckDTO[]>([]);
  const [containers, setContainers] = useState<ContainerSnapshotDTO[]>([]);
  const [vms, setVms] = useState<ProxmoxVmDTO[]>([]);

  const loadAll = useCallback(async () => {
    const [serverRes, metricsRes, checksRes, containersRes, vmsRes] = await Promise.all([
      fetch(`/api/servers/${serverId}`),
      fetch(`/api/servers/${serverId}/metrics?hours=6`),
      fetch(`/api/servers/${serverId}/checks`),
      fetch(`/api/servers/${serverId}/containers`),
      fetch(`/api/servers/${serverId}/vms`),
    ]);
    if (serverRes.ok) setServer((await serverRes.json()).server);
    if (metricsRes.ok) {
      const data = await metricsRes.json();
      setSamples(data.samples);
      setDiskSamples(data.diskSamples ?? []);
      setDisks(data.disks ?? []);
    }
    if (checksRes.ok) setChecks((await checksRes.json()).checks);
    if (containersRes.ok) setContainers((await containersRes.json()).containers);
    if (vmsRes.ok) setVms((await vmsRes.json()).vms);
  }, [serverId]);

  useEffect(() => {
    let active = true;
    (async () => {
      const [serverRes, metricsRes, checksRes, containersRes, vmsRes] = await Promise.all([
        fetch(`/api/servers/${serverId}`),
        fetch(`/api/servers/${serverId}/metrics?hours=6`),
        fetch(`/api/servers/${serverId}/checks`),
        fetch(`/api/servers/${serverId}/containers`),
        fetch(`/api/servers/${serverId}/vms`),
      ]);
      if (!active) return;
      if (serverRes.ok) setServer((await serverRes.json()).server);
      if (metricsRes.ok) {
        const data = await metricsRes.json();
        setSamples(data.samples);
        setDiskSamples(data.diskSamples ?? []);
        setDisks(data.disks ?? []);
      }
      if (checksRes.ok) setChecks((await checksRes.json()).checks);
      if (containersRes.ok) setContainers((await containersRes.json()).containers);
      if (vmsRes.ok) setVms((await vmsRes.json()).vms);
    })();
    return () => {
      active = false;
    };
  }, [serverId]);

  const effectiveSelectedMounts = useMemo(() => {
    if (selectedMounts !== null) return selectedMounts;
    if (disks.length === 0) return [];
    const root = disks.find((d) => d.mountpoint === "/");
    return [(root ?? disks[0]).mountpoint];
  }, [selectedMounts, disks]);

  useLiveEvents((event) => {
    if (event.type === "metric" && event.serverId === serverId) {
      setSamples((prev) => [...prev, event.sample as unknown as MetricSampleDTO].slice(-500));
      const newDisks = (event.disks ?? []) as unknown as DiskSampleDTO[];
      if (newDisks.length > 0) {
        setDiskSamples((prev) => [...prev, ...newDisks].slice(-2000));
        setDisks((prev) => {
          const byMount = new Map(prev.map((d) => [d.mountpoint, d]));
          for (const d of newDisks) {
            byMount.set(d.mountpoint, {
              mountpoint: d.mountpoint,
              device: d.device,
              totalKb: d.totalKb,
              percent: d.percent,
            });
          }
          return Array.from(byMount.values()).sort((a, b) =>
            a.mountpoint.localeCompare(b.mountpoint)
          );
        });
      }
    }
    if (event.type === "server-status" && event.serverId === serverId) {
      setServer((prev) =>
        prev
          ? {
              ...prev,
              lastStatus: event.status as ServerDTO["lastStatus"],
              lastError: event.error ?? null,
            }
          : prev
      );
    }
    if (event.type === "docker" && event.serverId === serverId) {
      setContainers(event.containers as ContainerSnapshotDTO[]);
    }
    if (event.type === "proxmox" && event.serverId === serverId) {
      setVms(event.vms as ProxmoxVmDTO[]);
    }
    if (event.type === "service-check" && event.serverId === serverId) {
      setChecks((prev) =>
        prev.map((c) =>
          c.id === event.serviceCheckId
            ? { ...c, lastStatus: event.status as ServiceCheckDTO["lastStatus"] }
            : c
        )
      );
    }
  });

  async function deleteCheck(id: string) {
    const res = await fetch(`/api/checks/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Check gelöscht");
      setChecks((prev) => prev.filter((c) => c.id !== id));
    }
  }

  async function deleteServer() {
    if (
      !(await confirm({
        title: "Server löschen",
        description: "Diesen Server wirklich löschen?",
        confirmText: "Löschen",
        variant: "destructive",
      }))
    )
      return;
    const res = await fetch(`/api/servers/${serverId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/servers");
    }
  }

  const combinedData: CombinedPoint[] = useMemo(() => {
    const byTime = new Map<string, CombinedPoint>();
    for (const s of samples) {
      byTime.set(s.timestamp, {
        timestamp: s.timestamp,
        cpuPercent: s.cpuPercent,
        memPercent: s.memPercent,
      });
    }
    for (const d of diskSamples) {
      if (!effectiveSelectedMounts.includes(d.mountpoint)) continue;
      let row = byTime.get(d.timestamp);
      if (!row) {
        row = { timestamp: d.timestamp, cpuPercent: null, memPercent: null };
        byTime.set(d.timestamp, row);
      }
      row[`${DISK_KEY_PREFIX}${d.mountpoint}`] = d.percent;
    }
    return Array.from(byTime.values()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [samples, diskSamples, effectiveSelectedMounts]);

  if (!server) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const latest = samples.at(-1);

  const diskLines = effectiveSelectedMounts.map((mountpoint) => ({
    key: `${DISK_KEY_PREFIX}${mountpoint}`,
    label: mountpoint,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/servers"
            className={buttonVariants({ variant: "ghost", size: "icon" })}
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{server.name}</h1>
              <StatusBadge status={server.lastStatus} />
            </div>
            <p className="text-sm text-muted-foreground">
              {server.sshUsername}@{server.hostname}:{server.sshPort}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openTerminal(server.id, server.name)}
            >
              <TerminalSquare className="size-4" />
              Terminal
            </Button>
          )}
          {canEdit && (
            <PowerActionDialog
              serverId={serverId}
              serverName={server.name}
              action="reboot"
              onDone={loadAll}
              trigger={
                <Button variant="outline" size="sm">
                  <RotateCw className="size-4" />
                  Neu starten
                </Button>
              }
            />
          )}
          {canEdit && (
            <PowerActionDialog
              serverId={serverId}
              serverName={server.name}
              action="shutdown"
              onDone={loadAll}
              trigger={
                <Button variant="outline" size="sm">
                  <Power className="size-4" />
                  Herunterfahren
                </Button>
              }
            />
          )}
          {canEdit && (
            <ServerFormDialog
              server={server}
              onSaved={loadAll}
              trigger={
                <Button variant="outline" size="sm">
                  <Pencil className="size-4" />
                  Bearbeiten
                </Button>
              }
            />
          )}
          {canDelete && (
            <Button variant="destructive" size="sm" onClick={deleteServer}>
              <Trash2 className="size-4" />
              Löschen
            </Button>
          )}
        </div>
      </div>

      {server.lastError && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="py-3 text-sm text-red-500">
            {server.lastError}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle>CPU / RAM / Disk</CardTitle>
            <CardDescription>
              CPU {latest?.cpuPercent != null ? `${latest.cpuPercent.toFixed(1)}%` : "–"} · RAM{" "}
              {latest?.memPercent != null ? `${latest.memPercent.toFixed(1)}%` : "–"}
              {effectiveSelectedMounts.length > 0 &&
                ` · ${effectiveSelectedMounts.length} Laufwerk${
                  effectiveSelectedMounts.length > 1 ? "e" : ""
                }`}
            </CardDescription>
          </div>
          <DiskSelect
            disks={disks}
            selected={effectiveSelectedMounts}
            onChange={setSelectedMounts}
          />
        </CardHeader>
        <CardContent>
          <CombinedMetricChart data={combinedData} diskLines={diskLines} />
        </CardContent>
      </Card>

      {canEdit && <ProcessManagerCard serverId={serverId} canKill={canEdit} />}

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Dateimanager</CardTitle>
            <CardDescription>
              Dateien auf dem Server durchsuchen, bearbeiten sowie hoch- und herunterladen
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FileManagerTab serverId={serverId} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Docker-Container</CardTitle>
              <CardDescription>Aktueller Stand</CardDescription>
            </div>
            {server.dockerEnabled ? (
              <Link
                href={`/docker/${serverId}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Container className="size-4" />
                Verwalten
              </Link>
            ) : (
              <Container className="size-4 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent>
            {!server.dockerEnabled ? (
              <p className="text-sm text-muted-foreground">
                Docker ist für diesen Server nicht aktiviert. Aktivierbar unter „Bearbeiten“.
              </p>
            ) : containers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Kein Docker erkannt oder keine Container laufen.
              </p>
            ) : (
              <div className="space-y-2">
                {containers.map((c) => (
                  <Link
                    key={c.containerId}
                    href={`/docker/${serverId}/${c.containerId}`}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-accent"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{c.image}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {c.cpuPercent != null && <span>{c.cpuPercent.toFixed(1)}% CPU</span>}
                      <Badge
                        variant={c.state === "running" ? "default" : "secondary"}
                        className="capitalize"
                      >
                        {c.state}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>HTTP-Health-Checks</CardTitle>
              <CardDescription>Erreichbarkeit von Diensten</CardDescription>
            </div>
            {canEdit && <ServiceCheckDialog serverId={serverId} onSaved={loadAll} />}
          </CardHeader>
          <CardContent>
            {checks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Health-Checks konfiguriert.</p>
            ) : (
              <div className="space-y-2">
                {checks.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{c.url}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.lastLatencyMs != null && (
                        <span className="text-xs text-muted-foreground">
                          {Math.round(c.lastLatencyMs)}ms
                        </span>
                      )}
                      <StatusBadge status={c.lastStatus} />
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          onClick={() => deleteCheck(c.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {!server.proxmoxEnabled ? (
        <Card>
          <CardHeader>
            <CardTitle>Virtuelle Maschinen</CardTitle>
            <CardDescription>Proxmox QEMU-VMs / LXC-Container</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Proxmox ist für diesen Server nicht aktiviert. Aktivierbar unter „Bearbeiten“.
            </p>
          </CardContent>
        </Card>
      ) : vms.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Virtuelle Maschinen</CardTitle>
                <CardDescription>Proxmox QEMU-VMs auf diesem Host</CardDescription>
              </div>
              <Cpu className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {vms.filter((v) => v.type === "QEMU").length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine VMs gefunden.</p>
              ) : (
                <div className="space-y-2">
                  {vms
                    .filter((v) => v.type === "QEMU")
                    .map((vm) => (
                      <VmRow
                        key={vm.id}
                        vm={vm}
                        canControl={canEdit}
                        href={`/vms/${vm.serverId}/${vm.vmid}`}
                        onDone={loadAll}
                      />
                    ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>LXC-Container</CardTitle>
                <CardDescription>Proxmox-LXC-Container auf diesem Host</CardDescription>
              </div>
              <Boxes className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {vms.filter((v) => v.type === "LXC").length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine LXC-Container gefunden.</p>
              ) : (
                <div className="space-y-2">
                  {vms
                    .filter((v) => v.type === "LXC")
                    .map((vm) => (
                      <VmRow
                        key={vm.id}
                        vm={vm}
                        canControl={canEdit}
                        href={`/vms/${vm.serverId}/${vm.vmid}`}
                        onDone={loadAll}
                      />
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
