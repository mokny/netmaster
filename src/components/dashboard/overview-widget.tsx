"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { useLiveEvents } from "@/hooks/use-live-events";
import type { ServerDTO } from "@/lib/types";

export function OverviewWidget() {
  const [servers, setServers] = useState<ServerDTO[]>([]);

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
    <div className="flex h-full flex-col gap-3">
      <div className="grid grid-cols-4 gap-2 text-center">
        {(["OK", "WARNING", "CRITICAL", "UNKNOWN"] as const).map((key) => (
          <div key={key} className="rounded-md border p-2">
            <p className="text-lg font-semibold">{counts[key]}</p>
            <StatusBadge status={key} className="mt-1" />
          </div>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {problematic.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Alle {servers.length} Server sind OK.
          </p>
        ) : (
          <ul className="space-y-1">
            {problematic.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/servers/${s.id}`}
                  className="flex items-center justify-between rounded-md px-2 py-1 text-sm hover:bg-accent"
                >
                  <span className="truncate">{s.name}</span>
                  <StatusBadge status={s.lastStatus} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
