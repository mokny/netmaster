"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { MetricBar } from "@/components/dashboard/metric-bar";
import { Badge } from "@/components/ui/badge";
import { useLiveEvents } from "@/hooks/use-live-events";
import { VM_GENERIC_WARN, VM_GENERIC_CRIT } from "@/lib/thresholds";
import type { ContainerSnapshotDTO } from "@/lib/types";

const RUNNING_STATES = new Set(["running"]);

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function DockerHostWidget({
  serverId,
  aggregation = "weighted",
  showProblematic = false,
}: {
  serverId: string;
  aggregation?: "weighted" | "average";
  showProblematic?: boolean;
}) {
  const t = useTranslations("dashboard.widgets.docker");
  const tCommon = useTranslations("common");
  const [containers, setContainers] = useState<ContainerSnapshotDTO[] | null>(null);

  useEffect(() => {
    fetch(`/api/servers/${serverId}/containers`)
      .then((res) => (res.ok ? res.json() : { containers: [] }))
      .then((data) => setContainers(data.containers ?? []));
  }, [serverId]);

  useLiveEvents((event) => {
    if (event.type === "docker" && event.serverId === serverId) {
      setContainers(event.containers as ContainerSnapshotDTO[]);
    }
  });

  if (!containers) {
    return <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>;
  }

  const running = containers.filter((c) => RUNNING_STATES.has(c.state));
  const stopped = containers.filter((c) => !RUNNING_STATES.has(c.state));

  const cpuValues = running.map((c) => c.cpuPercent).filter((v): v is number => v != null);
  const cpuPercent = average(cpuValues);

  const memValues = containers.map((c) => c.memUsageMb).filter((v): v is number => v != null);
  const memMb =
    aggregation === "weighted"
      ? memValues.reduce((a, b) => a + b, 0)
      : average(memValues);

  const problematic = containers.filter(
    (c) => !RUNNING_STATES.has(c.state) || (c.cpuPercent != null && c.cpuPercent >= VM_GENERIC_CRIT)
  );

  return (
    <div className="flex h-full min-w-0 flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 text-center text-xs">
        <div className="min-w-0 overflow-hidden rounded-md border p-2">
          <p className="truncate text-lg font-semibold">{running.length}</p>
          <p className="truncate text-muted-foreground">{t("running")}</p>
        </div>
        <div className="min-w-0 overflow-hidden rounded-md border p-2">
          <p className="truncate text-lg font-semibold">{stopped.length}</p>
          <p className="truncate text-muted-foreground">{t("stopped")}</p>
        </div>
      </div>

      <div className="space-y-2">
        <MetricBar label={t("cpuAverage")} value={cpuPercent} warn={VM_GENERIC_WARN} crit={VM_GENERIC_CRIT} />
        <p className="text-sm text-muted-foreground">
          {aggregation === "weighted" ? t("ramTotal") : t("ramAveragePerContainer")}:{" "}
          {memMb != null ? `${memMb.toFixed(0)} MB` : "–"}
        </p>
      </div>

      {showProblematic && (
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {problematic.length === 0 ? (
            <p className="truncate text-sm text-muted-foreground">
              {t("allContainersHealthy", { count: containers.length })}
            </p>
          ) : (
            <ul className="space-y-1">
              {problematic.map((c) => (
                <li
                  key={c.containerId}
                  className="flex min-w-0 items-center justify-between gap-2 rounded-md px-2 py-1 text-sm"
                >
                  <span className="min-w-0 truncate">{c.name}</span>
                  <Badge
                    variant={RUNNING_STATES.has(c.state) ? "default" : "secondary"}
                    className="shrink-0 capitalize"
                  >
                    {c.state}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {stopped.length > 0 && !showProblematic && (
        <p className="truncate text-xs text-muted-foreground">
          {t("stoppedCount", { count: stopped.length })}
        </p>
      )}
    </div>
  );
}
