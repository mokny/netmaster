"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { MetricBar } from "@/components/dashboard/metric-bar";
import { useLiveEvents } from "@/hooks/use-live-events";
import { VM_GENERIC_WARN, VM_GENERIC_CRIT } from "@/lib/thresholds";
import type { ContainerSnapshotDTO } from "@/lib/types";

const RUNNING_STATES = new Set(["running"]);

export function DockerContainerCompactWidget({
  serverId,
  containerId,
}: {
  serverId: string;
  containerId: string;
}) {
  const t = useTranslations("common");
  const [container, setContainer] = useState<ContainerSnapshotDTO | null>(null);

  useEffect(() => {
    fetch(`/api/servers/${serverId}/containers/${containerId}?hours=1`)
      .then((res) => (res.ok ? res.json() : { container: null }))
      .then((data) => setContainer(data.container));
  }, [serverId, containerId]);

  useLiveEvents((event) => {
    if (event.type !== "docker" || event.serverId !== serverId) return;
    const updated = (event.containers as ContainerSnapshotDTO[]).find(
      (c) => c.containerId === containerId
    );
    if (updated) setContainer((prev) => (prev ? { ...prev, ...updated } : prev));
  });

  if (!container) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }

  const running = RUNNING_STATES.has(container.state);

  return (
    <div className="flex h-full min-w-0 flex-col justify-center gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm text-muted-foreground">{container.image}</span>
        <Badge variant={running ? "default" : "secondary"} className="shrink-0 capitalize">
          {container.state}
        </Badge>
      </div>
      <MetricBar
        label="CPU"
        value={container.cpuPercent}
        warn={VM_GENERIC_WARN}
        crit={VM_GENERIC_CRIT}
      />
      <p className="text-sm text-muted-foreground">
        RAM: {container.memUsageMb != null ? `${container.memUsageMb.toFixed(0)} MB` : "–"}
      </p>
    </div>
  );
}
