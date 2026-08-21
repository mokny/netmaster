"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { StatusDetailDialog } from "@/components/status-detail-dialog";
import { useLiveEvents } from "@/hooks/use-live-events";
import type { ServerDTO } from "@/lib/types";

export function OverviewWidget() {
  const t = useTranslations("dashboard.widgets.overview");
  const [servers, setServers] = useState<ServerDTO[]>([]);
  const [detailServerId, setDetailServerId] = useState<string | null>(null);
  const detailServer = servers.find((s) => s.id === detailServerId) ?? null;

  async function recheck(id: string) {
    const res = await fetch(`/api/servers/${id}/check`, { method: "POST" });
    if (!res.ok) throw new Error(t("checkFailed"));
    const data = await res.json();
    setServers((prev) => prev.map((s) => (s.id === id ? data.server : s)));
  }

  useEffect(() => {
    fetch("/api/servers")
      .then((res) => (res.ok ? res.json() : { servers: [] }))
      .then((data) => setServers(data.servers));
  }, []);

  useLiveEvents((event) => {
    if (event.type === "server-status") {
      setServers((prev) =>
        prev.map((s) =>
          s.id === event.serverId
            ? { ...s, lastStatus: event.status as ServerDTO["lastStatus"] }
            : s
        )
      );
    }
  });

  const counts = {
    OK: servers.filter((s) => s.lastStatus === "OK").length,
    WARNING: servers.filter((s) => s.lastStatus === "WARNING").length,
    CRITICAL: servers.filter((s) => s.lastStatus === "CRITICAL").length,
    UNKNOWN: servers.filter((s) => s.lastStatus === "UNKNOWN").length,
  };

  const problematic = servers.filter((s) => s.lastStatus !== "OK");

  return (
    <div className="flex h-full min-w-0 flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 text-center @xs:grid-cols-4">
        {(["OK", "WARNING", "CRITICAL", "UNKNOWN"] as const).map((key) => (
          <div key={key} className="min-w-0 overflow-hidden rounded-md border p-2">
            <p className="truncate text-lg font-semibold">{counts[key]}</p>
            <StatusBadge status={key} className="mt-1 max-w-full" />
          </div>
        ))}
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {problematic.length === 0 ? (
          <p className="truncate text-sm text-muted-foreground">
            {t("allServersOk", { count: servers.length })}
          </p>
        ) : (
          <ul className="space-y-1">
            {problematic.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/servers/${s.id}`}
                  className="flex min-w-0 items-center justify-between gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent"
                >
                  <span className="min-w-0 truncate">{s.name}</span>
                  <StatusBadge
                    status={s.lastStatus}
                    className="shrink-0"
                    onClick={() => setDetailServerId(s.id)}
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {detailServer && (
        <StatusDetailDialog
          open={!!detailServer}
          onOpenChange={(o) => !o && setDetailServerId(null)}
          title={detailServer.name}
          subtitle={detailServer.hostname}
          status={detailServer.lastStatus}
          error={detailServer.lastError}
          checkedAt={detailServer.lastCheckedAt}
          metrics={[
            { label: "CPU", status: detailServer.lastCpuStatus },
            { label: t("metricMemory"), status: detailServer.lastMemStatus },
            { label: t("metricDisk"), status: detailServer.lastDiskStatus },
            { label: t("metricNetwork"), status: detailServer.lastNetStatus },
          ]}
          onRecheck={() => recheck(detailServer.id)}
        />
      )}
    </div>
  );
}
