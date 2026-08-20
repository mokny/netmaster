"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactGridLayout, { WidthProvider, type Layout } from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WidgetCard } from "@/components/dashboard/widget-card";
import { OverviewWidget } from "@/components/dashboard/overview-widget";
import { ServerMetricWidget } from "@/components/dashboard/server-metric-widget";
import { ServerCombinedCompactWidget } from "@/components/dashboard/server-combined-compact-widget";
import { ServerCombinedChartWidget } from "@/components/dashboard/server-combined-chart-widget";
import { VmCombinedCompactWidget } from "@/components/dashboard/vm-combined-compact-widget";
import { VmCombinedChartWidget } from "@/components/dashboard/vm-combined-chart-widget";
import { ProxmoxHostWidget } from "@/components/dashboard/proxmox-host-widget";
import { ProxmoxGlobalWidget } from "@/components/dashboard/proxmox-global-widget";
import { DockerContainerCompactWidget } from "@/components/dashboard/docker-container-compact-widget";
import { DockerContainerChartWidget } from "@/components/dashboard/docker-container-chart-widget";
import { DockerHostWidget } from "@/components/dashboard/docker-host-widget";
import { DockerGlobalWidget } from "@/components/dashboard/docker-global-widget";
import { AddWidgetDialog, type WidgetSpec } from "@/components/dashboard/add-widget-dialog";
import { resolveWidgetTitle, type NameLookups } from "@/lib/widget-titles";
import { useIsMobile } from "@/hooks/use-is-mobile";
import type { ProxmoxVmWithServerDTO, ContainerWithServerDTO, ServerDTO } from "@/lib/types";
import { LayoutGrid, Pencil, Check } from "lucide-react";

const DEFAULT_SIZE: Record<WidgetSpec["type"], { w: number; h: number }> = {
  overview: { w: 4, h: 4 },
  "server-metric": { w: 4, h: 4 },
  "server-combined-compact": { w: 3, h: 3 },
  "server-combined-chart": { w: 5, h: 4 },
  "vm-combined-compact": { w: 3, h: 3 },
  "vm-combined-chart": { w: 5, h: 4 },
  "proxmox-host": { w: 4, h: 4 },
  "proxmox-global": { w: 5, h: 6 },
  "docker-container-compact": { w: 3, h: 3 },
  "docker-container-chart": { w: 5, h: 4 },
  "docker-host": { w: 4, h: 4 },
  "docker-global": { w: 5, h: 6 },
};

const GridLayoutWithWidth = WidthProvider(ReactGridLayout);

interface WidgetItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  spec: WidgetSpec;
}

const DEFAULT_LAYOUT: WidgetItem[] = [
  { i: "overview", x: 0, y: 0, w: 4, h: 4, title: "Übersicht", spec: { type: "overview" } },
];

function renderWidgetContent(spec: WidgetSpec) {
  switch (spec.type) {
    case "overview":
      return <OverviewWidget />;
    case "server-metric":
      return <ServerMetricWidget serverId={spec.serverId} metric={spec.metric} />;
    case "server-combined-compact":
      return <ServerCombinedCompactWidget serverId={spec.serverId} />;
    case "server-combined-chart":
      return <ServerCombinedChartWidget serverId={spec.serverId} />;
    case "vm-combined-compact":
      return <VmCombinedCompactWidget serverId={spec.serverId} vmid={spec.vmid} />;
    case "vm-combined-chart":
      return <VmCombinedChartWidget serverId={spec.serverId} vmid={spec.vmid} />;
    case "proxmox-host":
      return (
        <ProxmoxHostWidget
          serverId={spec.serverId}
          aggregation={spec.aggregation}
          showProblematic={spec.showProblematic}
        />
      );
    case "proxmox-global":
      return <ProxmoxGlobalWidget />;
    case "docker-container-compact":
      return (
        <DockerContainerCompactWidget serverId={spec.serverId} containerId={spec.containerId} />
      );
    case "docker-container-chart":
      return (
        <DockerContainerChartWidget serverId={spec.serverId} containerId={spec.containerId} />
      );
    case "docker-host":
      return (
        <DockerHostWidget
          serverId={spec.serverId}
          aggregation={spec.aggregation}
          showProblematic={spec.showProblematic}
        />
      );
    default:
      return <DockerGlobalWidget />;
  }
}

export function DashboardGrid() {
  const [widgets, setWidgets] = useState<WidgetItem[] | null>(null);
  const [editing, setEditing] = useState(false);
  const isMobile = useIsMobile();
  const [lookups, setLookups] = useState<NameLookups | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/layout")
      .then((res) => (res.ok ? res.json() : { layout: [] }))
      .then((data) => {
        setWidgets(data.layout && data.layout.length > 0 ? data.layout : DEFAULT_LAYOUT);
      });
  }, []);

  const loadLookups = useCallback(() => {
    Promise.all([
      fetch("/api/servers").then((res) => (res.ok ? res.json() : { servers: [] })),
      fetch("/api/vms").then((res) => (res.ok ? res.json() : { vms: [] })),
      fetch("/api/containers").then((res) => (res.ok ? res.json() : { containers: [] })),
    ]).then(([serversData, vmsData, containersData]) => {
      const servers = new Map<string, string>(
        (serversData.servers as ServerDTO[]).map((s) => [s.id, s.name])
      );
      const vms = new Map<string, string>(
        (vmsData.vms as ProxmoxVmWithServerDTO[]).map((v) => [`${v.serverId}:${v.vmid}`, v.name])
      );
      const containers = new Map<string, string>(
        (containersData.containers as ContainerWithServerDTO[]).map((c) => [
          `${c.serverId}:${c.containerId}`,
          c.name,
        ])
      );
      setLookups({ servers, vms, containers });
    });
  }, []);

  useEffect(() => {
    loadLookups();
    const interval = setInterval(loadLookups, 60_000);
    return () => clearInterval(interval);
  }, [loadLookups]);

  const persist = useCallback((next: WidgetItem[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/dashboard/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout: next }),
      });
    }, 600);
  }, []);

  function onLayoutChange(layout: Layout) {
    setWidgets((prev) => {
      if (!prev) return prev;
      const next = prev.map((w) => {
        const pos = layout.find((l) => l.i === w.i);
        return pos ? { ...w, x: pos.x, y: pos.y, w: pos.w, h: pos.h } : w;
      });
      persist(next);
      return next;
    });
  }

  function addWidget(spec: WidgetSpec, title: string) {
    setWidgets((prev) => {
      const list = prev ?? [];
      const maxY = list.reduce((m, w) => Math.max(m, w.y + w.h), 0);
      const id = `${spec.type}-${Date.now()}`;
      const size = DEFAULT_SIZE[spec.type];
      const h =
        (spec.type === "proxmox-host" || spec.type === "docker-host") && spec.showProblematic
          ? Math.max(size.h, 6)
          : size.h;
      const next = [
        ...list,
        { i: id, x: 0, y: maxY, w: size.w, h, title, spec },
      ];
      persist(next);
      return next;
    });
  }

  function removeWidget(id: string) {
    setWidgets((prev) => {
      if (!prev) return prev;
      const next = prev.filter((w) => w.i !== id);
      persist(next);
      return next;
    });
  }

  if (!widgets) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Frei anordenbare Live-Übersicht deiner Infrastruktur.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {editing && <AddWidgetDialog onAdd={addWidget} />}
          <Button
            size="sm"
            variant={editing ? "default" : "outline"}
            onClick={() => setEditing((e) => !e)}
          >
            {editing ? <Check className="size-4" /> : <Pencil className="size-4" />}
            {editing ? "Fertig" : "Layout bearbeiten"}
          </Button>
        </div>
      </div>

      {widgets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <LayoutGrid className="size-10 text-muted-foreground" />
          <p className="text-muted-foreground">Noch keine Widgets auf dem Dashboard.</p>
          <AddWidgetDialog onAdd={addWidget} />
        </div>
      ) : isMobile ? (
        // Auf schmalen Screens ist das freie 12-Spalten-Grid unbrauchbar
        // (Widgets würden auf Bruchteile ihrer Breite gequetscht) - daher
        // gestapelte Einzelspalte ohne Drag/Resize, gleiche Widgets/Reihenfolge.
        <div className="space-y-4">
          {[...widgets]
            .sort((a, b) => a.y - b.y || a.x - b.x)
            .map((w) => (
              <WidgetCard
                key={w.i}
                title={lookups ? resolveWidgetTitle(w.spec, lookups) : w.title}
                editing={editing}
                onRemove={() => removeWidget(w.i)}
              >
                {renderWidgetContent(w.spec)}
              </WidgetCard>
            ))}
        </div>
      ) : (
        <GridLayoutWithWidth
          className="layout"
          layout={widgets}
          cols={12}
          rowHeight={48}
          margin={[12, 12]}
          isDraggable={editing}
          isResizable={editing}
          draggableHandle=".widget-drag-handle"
          onLayoutChange={onLayoutChange}
        >
          {widgets.map((w) => (
            <div key={w.i}>
              <WidgetCard
                title={lookups ? resolveWidgetTitle(w.spec, lookups) : w.title}
                editing={editing}
                onRemove={() => removeWidget(w.i)}
              >
                {renderWidgetContent(w.spec)}
              </WidgetCard>
            </div>
          ))}
        </GridLayoutWithWidth>
      )}
    </div>
  );
}
