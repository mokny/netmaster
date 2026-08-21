"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { MetricBar } from "@/components/dashboard/metric-bar";
import { useLiveEvents } from "@/hooks/use-live-events";
import type { MetricSampleDTO, ServerDTO } from "@/lib/types";

export function ServerCombinedCompactWidget({ serverId }: { serverId: string }) {
  const t = useTranslations("common");
  const [server, setServer] = useState<ServerDTO | null>(null);
  const [latest, setLatest] = useState<MetricSampleDTO | null>(null);

  useEffect(() => {
    fetch(`/api/servers/${serverId}`)
      .then((res) => (res.ok ? res.json() : { server: null }))
      .then((data) => setServer(data.server));
  }, [serverId]);

  useEffect(() => {
    fetch(`/api/servers/${serverId}/metrics?hours=1`)
      .then((res) => (res.ok ? res.json() : { samples: [] }))
      .then((data) => setLatest(data.samples?.at(-1) ?? null));
  }, [serverId]);

  useLiveEvents((event) => {
    if (event.type === "metric" && event.serverId === serverId) {
      setLatest(event.sample as unknown as MetricSampleDTO);
    }
  });

  if (!server) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }

  return (
    <div className="flex h-full min-w-0 flex-col justify-center gap-3">
      <MetricBar
        label="CPU"
        value={latest?.cpuPercent ?? null}
        warn={server.cpuWarn}
        crit={server.cpuCrit}
      />
      <MetricBar
        label="RAM"
        value={latest?.memPercent ?? null}
        warn={server.memWarn}
        crit={server.memCrit}
      />
      <MetricBar
        label="Disk"
        value={latest?.diskPercent ?? null}
        warn={server.diskWarn}
        crit={server.diskCrit}
      />
    </div>
  );
}
