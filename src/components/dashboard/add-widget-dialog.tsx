"use client";

import { useTranslations } from "next-intl";
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
import type { ContainerSnapshotDTO, ProxmoxVmDTO, ServerDTO } from "@/lib/types";

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
  | { type: "proxmox-global" }
  | { type: "docker-container-compact"; serverId: string; containerId: string }
  | { type: "docker-container-chart"; serverId: string; containerId: string }
  | {
      type: "docker-host";
      serverId: string;
      aggregation: "weighted" | "average";
      showProblematic: boolean;
    }
  | { type: "docker-global" };

const WIDGET_TYPE_VALUES = [
  "server-metric",
  "server-combined-compact",
  "server-combined-chart",
  "vm-combined-compact",
  "vm-combined-chart",
  "proxmox-host",
  "proxmox-global",
  "docker-container-compact",
  "docker-container-chart",
  "docker-host",
  "docker-global",
  "overview",
] as const;

type WidgetType = (typeof WIDGET_TYPE_VALUES)[number];

function buildWidgetTypeOptions(t: (key: string) => string) {
  return WIDGET_TYPE_VALUES.map((value) => ({
    value,
    label: t(`widgetTypes.${value}`),
  }));
}

export function AddWidgetDialog({
  onAdd,
}: {
  onAdd: (widget: WidgetSpec, title: string) => void;
}) {
  const t = useTranslations("dashboard.addWidgetDialog");
  const widgetTypeOptions = buildWidgetTypeOptions(t);
  const [open, setOpen] = useState(false);
  const [servers, setServers] = useState<ServerDTO[]>([]);
  const [widgetType, setWidgetType] = useState<WidgetType>("server-metric");
  const [serverId, setServerId] = useState<string>("");
  const [metric, setMetric] = useState("cpuPercent");
  const [vms, setVms] = useState<ProxmoxVmDTO[]>([]);
  const [vmid, setVmid] = useState<string>("");
  const [containers, setContainers] = useState<ContainerSnapshotDTO[]>([]);
  const [containerId, setContainerId] = useState<string>("");
  const [aggregation, setAggregation] = useState<"weighted" | "average">("weighted");
  const [showProblematic, setShowProblematic] = useState(false);

  const needsServer = widgetType !== "overview" && widgetType !== "proxmox-global" && widgetType !== "docker-global";
  const needsVm = widgetType === "vm-combined-compact" || widgetType === "vm-combined-chart";
  const needsContainer =
    widgetType === "docker-container-compact" || widgetType === "docker-container-chart";
  const needsAggregation = widgetType === "proxmox-host" || widgetType === "docker-host";

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

  useEffect(() => {
    if (!needsContainer || !serverId) return;
    fetch(`/api/servers/${serverId}/containers`)
      .then((res) => (res.ok ? res.json() : { containers: [] }))
      .then((data) => {
        setContainers(data.containers ?? []);
        setContainerId(data.containers?.[0]?.containerId ?? "");
      });
  }, [needsContainer, serverId]);

  function add() {
    const server = servers.find((s) => s.id === serverId);

    const history = t("historySuffix");

    if (widgetType === "overview") {
      onAdd({ type: "overview" }, t("widgetTypes.overview"));
    } else if (widgetType === "proxmox-global") {
      onAdd({ type: "proxmox-global" }, t("proxmoxOverviewTitle"));
    } else if (widgetType === "docker-global") {
      onAdd({ type: "docker-global" }, t("dockerOverviewTitle"));
    } else if (widgetType === "server-combined-compact") {
      onAdd(
        { type: "server-combined-compact", serverId },
        `${server?.name ?? t("fallbackServer")} – CPU/RAM/Disk`
      );
    } else if (widgetType === "server-combined-chart") {
      onAdd(
        { type: "server-combined-chart", serverId },
        `${server?.name ?? t("fallbackServer")} – CPU/RAM/Disk (${history})`
      );
    } else if (widgetType === "proxmox-host") {
      onAdd(
        { type: "proxmox-host", serverId, aggregation, showProblematic },
        `${server?.name ?? t("fallbackHost")} – Proxmox`
      );
    } else if (widgetType === "docker-host") {
      onAdd(
        { type: "docker-host", serverId, aggregation, showProblematic },
        `${server?.name ?? t("fallbackHost")} – Docker`
      );
    } else if (widgetType === "vm-combined-compact" || widgetType === "vm-combined-chart") {
      const vm = vms.find((v) => String(v.vmid) === vmid);
      const suffix = widgetType === "vm-combined-chart" ? ` (${history})` : "";
      onAdd(
        { type: widgetType, serverId, vmid: Number(vmid) },
        `${vm?.name ?? t("fallbackVm")} – CPU/RAM/Disk${suffix}`
      );
    } else if (
      widgetType === "docker-container-compact" ||
      widgetType === "docker-container-chart"
    ) {
      const container = containers.find((c) => c.containerId === containerId);
      const suffix = widgetType === "docker-container-chart" ? ` (${history})` : "";
      onAdd(
        { type: widgetType, serverId, containerId },
        `${container?.name ?? t("fallbackContainer")} – Docker${suffix}`
      );
    } else {
      const metricLabel =
        metric === "cpuPercent" ? "CPU" : metric === "memPercent" ? "RAM" : "Disk";
      onAdd(
        { type: "server-metric", serverId, metric },
        `${server?.name ?? t("fallbackServer")} – ${metricLabel}`
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
            {t("trigger")}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>{t("widgetTypeLabel")}</Label>
            <Select value={widgetType} onValueChange={(v) => setWidgetType(v as WidgetType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {widgetTypeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsServer && (
            <div className="space-y-2">
              <Label>
                {needsVm || needsContainer || needsAggregation ? t("hostLabel") : t("serverLabel")}
              </Label>
              <Select value={serverId} onValueChange={(v) => setServerId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("selectServerPlaceholder")} />
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
              <Label>{t("metricLabel")}</Label>
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
                  <SelectValue placeholder={t("selectVmPlaceholder")} />
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

          {needsContainer && (
            <div className="space-y-2">
              <Label>Container</Label>
              <Select value={containerId} onValueChange={(v) => setContainerId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("selectContainerPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {containers.map((c) => (
                    <SelectItem key={c.containerId} value={c.containerId}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {needsAggregation && (
            <>
              <div className="space-y-2">
                <Label>{t("aggregationLabel")}</Label>
                <Select
                  value={aggregation}
                  onValueChange={(v) => setAggregation((v as typeof aggregation) ?? "weighted")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weighted">{t("aggregationWeighted")}</SelectItem>
                    <SelectItem value="average">{t("aggregationAverage")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="show-problematic">
                  {widgetType === "docker-host"
                    ? t("showProblematicContainers")
                    : t("showProblematicVms")}
                </Label>
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
              (needsServer && !serverId) ||
              (needsVm && !vmid) ||
              (needsContainer && !containerId)
            }
          >
            {t("addButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
