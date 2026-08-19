"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus } from "lucide-react";
import type { ProxmoxVmDTO, ServerDTO } from "@/lib/types";

export type WidgetSpec =
  | { type: "overview" }
  | { type: "server-metric"; serverId: string; metric: string }
  | { type: "server-combined-compact"; serverId: string }
  | { type: "server-combined-chart"; serverId: string }
  | { type: "vm-combined-compact"; serverId: string; vmid: number }
  | { type: "vm-combined-chart"; serverId: string; vmid: number }
  | {
      type: "proxmox-host";
      serverId: string;
      aggregation: "weighted" | "average";
      showProblematic: boolean;
    }
  | { type: "proxmox-global" };

const WIDGET_TYPES = [
  { value: "server-metric", label: "Server-Metrik (einzeln)" },
  { value: "server-combined-compact", label: "Server: CPU/RAM/Disk (Kompakt)" },
  { value: "server-combined-chart", label: "Server: CPU/RAM/Disk (Verlauf)" },
  { value: "vm-combined-compact", label: "VM: CPU/RAM/Disk (Kompakt)" },
  { value: "vm-combined-chart", label: "VM: CPU/RAM/Disk (Verlauf)" },
  { value: "proxmox-host", label: "Proxmox-Host-Übersicht" },
  { value: "proxmox-global", label: "Proxmox-Gesamtübersicht" },
  { value: "overview", label: "Übersicht (alle Server)" },
] as const;

type WidgetType = (typeof WIDGET_TYPES)[number]["value"];

export function AddWidgetDialog({
  onAdd,
}: {
  onAdd: (widget: WidgetSpec, title: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [servers, setServers] = useState<ServerDTO[]>([]);
  const [widgetType, setWidgetType] = useState<WidgetType>("server-metric");
  const [serverId, setServerId] = useState<string>("");
  const [metric, setMetric] = useState("cpuPercent");
  const [vms, setVms] = useState<ProxmoxVmDTO[]>([]);
  const [vmid, setVmid] = useState<string>("");
  const [aggregation, setAggregation] = useState<"weighted" | "average">("weighted");
  const [showProblematic, setShowProblematic] = useState(false);

  const needsServer = widgetType !== "overview" && widgetType !== "proxmox-global";
  const needsVm = widgetType === "vm-combined-compact" || widgetType === "vm-combined-chart";

  useEffect(() => {
    if (!open) return;
    fetch("/api/servers")
      .then((res) => (res.ok ? res.json() : { servers: [] }))
      .then((data) => {
        setServers(data.servers);
        if (data.servers[0]) setServerId(data.servers[0].id);
      });
  }, [open]);

  useEffect(() => {
    if (!needsVm || !serverId) return;
    fetch(`/api/servers/${serverId}/vms`)
      .then((res) => (res.ok ? res.json() : { vms: [] }))
      .then((data) => {
        setVms(data.vms ?? []);
        setVmid(data.vms?.[0] ? String(data.vms[0].vmid) : "");
      });
  }, [needsVm, serverId]);

  function add() {
    const server = servers.find((s) => s.id === serverId);

    if (widgetType === "overview") {
      onAdd({ type: "overview" }, "Übersicht");
    } else if (widgetType === "proxmox-global") {
      onAdd({ type: "proxmox-global" }, "Proxmox-Übersicht");
    } else if (widgetType === "server-combined-compact") {
      onAdd(
        { type: "server-combined-compact", serverId },
        `${server?.name ?? "Server"} – CPU/RAM/Disk`
      );
    } else if (widgetType === "server-combined-chart") {
      onAdd(
        { type: "server-combined-chart", serverId },
        `${server?.name ?? "Server"} – CPU/RAM/Disk (Verlauf)`
      );
    } else if (widgetType === "proxmox-host") {
      onAdd(
        { type: "proxmox-host", serverId, aggregation, showProblematic },
        `${server?.name ?? "Host"} – Proxmox`
      );
    } else if (widgetType === "vm-combined-compact" || widgetType === "vm-combined-chart") {
      const vm = vms.find((v) => String(v.vmid) === vmid);
      const suffix = widgetType === "vm-combined-chart" ? " (Verlauf)" : "";
      onAdd(
        { type: widgetType, serverId, vmid: Number(vmid) },
        `${vm?.name ?? "VM"} – CPU/RAM/Disk${suffix}`
      );
    } else {
      const metricLabel =
        metric === "cpuPercent" ? "CPU" : metric === "memPercent" ? "RAM" : "Disk";
      onAdd(
        { type: "server-metric", serverId, metric },
        `${server?.name ?? "Server"} – ${metricLabel}`
      );
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Plus className="size-4" />
            Widget hinzufügen
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Widget hinzufügen</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Widget-Typ</Label>
            <Select value={widgetType} onValueChange={(v) => setWidgetType(v as WidgetType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WIDGET_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsServer && (
            <div className="space-y-2">
              <Label>{needsVm || widgetType === "proxmox-host" ? "Host" : "Server"}</Label>
              <Select value={serverId} onValueChange={(v) => setServerId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Server wählen" />
                </SelectTrigger>
                <SelectContent>
                  {servers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {widgetType === "server-metric" && (
            <div className="space-y-2">
              <Label>Metrik</Label>
              <Select value={metric} onValueChange={(v) => setMetric(v ?? "cpuPercent")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cpuPercent">CPU</SelectItem>
                  <SelectItem value="memPercent">RAM</SelectItem>
                  <SelectItem value="diskPercent">Disk</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {needsVm && (
            <div className="space-y-2">
              <Label>VM</Label>
              <Select value={vmid} onValueChange={(v) => setVmid(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="VM wählen" />
                </SelectTrigger>
                <SelectContent>
                  {vms.map((v) => (
                    <SelectItem key={v.id} value={String(v.vmid)}>
                      {v.name} (#{v.vmid})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {widgetType === "proxmox-host" && (
            <>
              <div className="space-y-2">
                <Label>Aggregation</Label>
                <Select
                  value={aggregation}
                  onValueChange={(v) => setAggregation((v as typeof aggregation) ?? "weighted")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weighted">Gewichtet (Σused/Σtotal)</SelectItem>
                    <SelectItem value="average">Einfacher Durchschnitt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="show-problematic">Problematische VMs anzeigen</Label>
                <Switch
                  id="show-problematic"
                  checked={showProblematic}
                  onCheckedChange={(c) => setShowProblematic(!!c)}
                />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={add}
            disabled={
              (needsServer && !serverId) || (needsVm && !vmid)
            }
          >
            Hinzufügen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
