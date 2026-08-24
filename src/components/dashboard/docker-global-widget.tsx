"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useLiveEvents } from "@/hooks/use-live-events";
import type { ContainerWithServerDTO } from "@/lib/types";

const RUNNING_STATES = new Set(["running"]);

export function DockerGlobalWidget() {
  const t = useTranslations("dashboard.widgets.docker");
  const tCommon = useTranslations("common");
  const [containers, setContainers] = useState<ContainerWithServerDTO[] | null>(null);
  const [polling, setPolling] = useState(false);

  const load = useCallback(() => {
    return fetch("/api/containers")
      .then((res) => (res.ok ? res.json() : { containers: [] }))
      .then((data) => setContainers(data.containers ?? []));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function pollNow() {
    setPolling(true);
    try {
      await fetch("/api/containers/poll-now", { method: "POST" });
      await load();
    } finally {
      setPolling(false);
    }
  }

  useLiveEvents((event) => {
    if (event.type !== "docker") return;
    setContainers((prev) => {
      if (!prev) return prev;
      const serverEntry = prev.find((c) => c.serverId === event.serverId);
      const serverName = serverEntry?.serverName ?? "";
      const incoming = event.containers as Array<{
        containerId: string;
        name: string;
        image: string;
        state: string;
        cpuPercent: number | null;
        memUsageMb: number | null;
        ips: string[];
      }>;
      const others = prev.filter((c) => c.serverId !== event.serverId);
      const updated = incoming.map((c) => ({
        ...c,
        id: `${event.serverId}-${c.containerId}`,
        serverId: event.serverId,
        serverName,
        netRxMb: null,
        netTxMb: null,
        timestamp: new Date().toISOString(),
      }));
      return [...others, ...updated].sort((a, b) => a.name.localeCompare(b.name));
    });
  });

  const byHost = useMemo(() => {
    if (!containers) return [];
    const map = new Map<
      string,
      { serverId: string; serverName: string; containers: ContainerWithServerDTO[] }
    >();
    for (const c of containers) {
      const entry = map.get(c.serverId) ?? {
        serverId: c.serverId,
        serverName: c.serverName,
        containers: [],
      };
      entry.containers.push(c);
      map.set(c.serverId, entry);
    }
    return [...map.values()].sort((a, b) => a.serverName.localeCompare(b.serverName));
  }, [containers]);

  if (!containers) {
    return <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>;
  }

  const running = containers.filter((c) => RUNNING_STATES.has(c.state)).length;
  const stopped = containers.length - running;

  return (
    <div className="flex h-full min-w-0 flex-col gap-3">
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          disabled={polling}
          onClick={pollNow}
          aria-label={tCommon("refresh")}
        >
          <RefreshCw className={`size-3.5 ${polling ? "animate-spin" : ""}`} />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-center text-xs">
        <div className="min-w-0 overflow-hidden rounded-md border p-2">
          <p className="truncate text-lg font-semibold">{running}</p>
          <p className="truncate text-muted-foreground">{t("running")}</p>
        </div>
        <div className="min-w-0 overflow-hidden rounded-md border p-2">
          <p className="truncate text-lg font-semibold">{stopped}</p>
          <p className="truncate text-muted-foreground">{t("stopped")}</p>
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {byHost.length === 0 ? (
          <p className="truncate text-sm text-muted-foreground">{t("noHostsFound")}</p>
        ) : (
          <ul className="space-y-1">
            {byHost.map((host) => {
              const hostRunning = host.containers.filter((c) =>
                RUNNING_STATES.has(c.state)
              ).length;
              return (
                <li key={host.serverId}>
                  <Link
                    href={`/servers/${host.serverId}`}
                    className="flex min-w-0 items-center justify-between gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent"
                  >
                    <span className="min-w-0 truncate">{host.serverName}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {t("runningOfTotal", { running: hostRunning, total: host.containers.length })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
