"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartTimeToolbar } from "@/components/charts/chart-time-toolbar";
import { ChartPanOverlay } from "@/components/charts/chart-pan-overlay";
import {
  DebugPollChart,
  PollTypeLegend,
  usePollTypeVisibility,
  type DebugMetricPoint,
  type PollLogEntry,
} from "@/components/admin/debug-poll-chart";
import { useChartTimeWindow } from "@/hooks/use-chart-time-window";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ArrowLeft } from "lucide-react";
import type { MetricSampleDTO, ServerDTO } from "@/lib/types";

const DEBUG_MAX_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

export function ServerDebugView({ serverId }: { serverId: string }) {
  const [server, setServer] = useState<ServerDTO | null>(null);
  const [samples, setSamples] = useState<MetricSampleDTO[]>([]);
  const [pollLog, setPollLog] = useState<PollLogEntry[]>([]);
  const [visible, setVisible] = usePollTypeVisibility();

  const chartWindow = useChartTimeWindow({ maxWindowMs: DEBUG_MAX_WINDOW_MS });
  const debouncedFrom = useDebouncedValue(chartWindow.from, 250);
  const debouncedTo = useDebouncedValue(chartWindow.to, 250);

  useEffect(() => {
    fetch(`/api/servers/${serverId}`)
      .then((res) => (res.ok ? res.json() : { server: null }))
      .then((data) => setServer(data.server));
  }, [serverId]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`/api/servers/${serverId}/metrics?from=${debouncedFrom}&to=${debouncedTo}`),
      fetch(`/api/servers/${serverId}/poll-log?from=${debouncedFrom}&to=${debouncedTo}`),
    ]).then(async ([metricsRes, pollLogRes]) => {
      if (!active) return;
      if (metricsRes.ok) setSamples((await metricsRes.json()).samples ?? []);
      if (pollLogRes.ok) setPollLog((await pollLogRes.json()).entries ?? []);
    });
    return () => {
      active = false;
    };
  }, [serverId, debouncedFrom, debouncedTo]);

  const data: DebugMetricPoint[] = samples.map((s) => ({
    ts: new Date(s.timestamp).getTime(),
    cpuPercent: s.cpuPercent,
    memPercent: s.memPercent,
    diskPercent: s.diskPercent,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/debug" className={buttonVariants({ variant: "ghost", size: "icon" })}>
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Poll debug{server ? ` · ${server.name}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            CPU/RAM/Disk mit Poll-Zeitpunkten als vertikale Marker. PollLog wird nur 2 Tage aufbewahrt.
          </p>
        </div>
      </div>

      {!server ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <div>
              <CardTitle>CPU / RAM / Disk</CardTitle>
              <CardDescription>Poll-Marker: durchgezogen = erfolgreich, gestrichelt = fehlgeschlagen</CardDescription>
            </div>
            <ChartTimeToolbar window={chartWindow} />
          </CardHeader>
          <CardContent className="space-y-3">
            <ChartPanOverlay windowMs={chartWindow.windowMs} onPanBy={chartWindow.panBy}>
              <DebugPollChart
                data={data}
                pollLog={pollLog}
                visible={visible}
                from={chartWindow.from}
                to={chartWindow.to}
              />
            </ChartPanOverlay>
            <PollTypeLegend
              visible={visible}
              onToggle={(type) => setVisible((prev) => ({ ...prev, [type]: !prev[type] }))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
