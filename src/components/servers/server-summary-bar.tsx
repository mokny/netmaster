"use client";

import { Cpu, MemoryStick, HardDrive, Clock, Terminal, Activity } from "lucide-react";
import { useTranslations } from "next-intl";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DiskInfoDTO, MetricSampleDTO, ServerDTO } from "@/lib/types";

function formatGb(kb: number | null): string | null {
  if (kb === null) return null;
  return `${(kb / 1024 / 1024).toFixed(1)} GB`;
}

function formatMb(mb: number | null): string | null {
  if (mb === null) return null;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

function formatUptime(bootedAt: string | null): string | null {
  if (!bootedAt) return null;
  const seconds = Math.max(0, (Date.now() - new Date(bootedAt).getTime()) / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function Tile({
  icon,
  label,
  value,
  sub,
  percent,
  tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  percent?: number | null;
  tooltip?: React.ReactNode;
}) {
  const inner = (
    <>
      <div className="text-muted-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
        {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
        {percent != null && (
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
            />
          </div>
        )}
      </div>
    </>
  );

  if (!tooltip) {
    return <div className="flex min-w-32 flex-1 items-center gap-2.5 px-3 py-2.5">{inner}</div>;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={<div className="flex min-w-32 flex-1 items-center gap-2.5 px-3 py-2.5" />}
      >
        {inner}
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function ServerSummaryBar({
  server,
  latest,
  disks,
}: {
  server: ServerDTO;
  latest: MetricSampleDTO | undefined;
  disks: DiskInfoDTO[];
}) {
  const t = useTranslations("servers.summaryBar");
  const memUsedMb =
    server.memTotalMb != null && latest?.memPercent != null
      ? (latest.memPercent / 100) * server.memTotalMb
      : null;

  const diskTotalKb = disks.reduce((s, d) => s + (d.totalKb ?? 0), 0);
  const diskUsedKb = disks.reduce(
    (s, d) => s + (d.totalKb != null && d.percent != null ? (d.percent / 100) * d.totalKb : 0),
    0
  );
  const diskPercent =
    diskTotalKb > 0 ? (diskUsedKb / diskTotalKb) * 100 : null;

  const uptime = formatUptime(server.bootedAt);

  const items: React.ReactNode[] = [];

  if (server.cpuCores != null) {
    items.push(
      <Tile
        key="cpu"
        icon={<Cpu className="size-4" />}
        label="CPU"
        value={t("cores", { count: server.cpuCores })}
        sub={latest?.cpuPercent != null ? t("utilized", { percent: latest.cpuPercent.toFixed(0) }) : undefined}
        percent={latest?.cpuPercent ?? undefined}
      />
    );
  }

  if (server.memTotalMb != null) {
    items.push(
      <Tile
        key="ram"
        icon={<MemoryStick className="size-4" />}
        label="RAM"
        value={formatMb(server.memTotalMb) ?? "–"}
        sub={memUsedMb != null ? t("used", { value: formatMb(memUsedMb) ?? "" }) : undefined}
        percent={latest?.memPercent ?? undefined}
      />
    );
  }

  if (disks.length > 0) {
    items.push(
      <Tile
        key="disk"
        icon={<HardDrive className="size-4" />}
        label={disks.length > 1 ? t("diskCount", { count: disks.length }) : t("disk")}
        value={formatGb(diskTotalKb) ?? "–"}
        sub={diskUsedKb > 0 ? t("used", { value: formatGb(diskUsedKb) ?? "" }) : undefined}
        percent={diskPercent ?? undefined}
        tooltip={
          <div className="space-y-1">
            {disks.map((d) => (
              <div key={d.mountpoint} className="flex items-center justify-between gap-4">
                <span>{d.mountpoint}</span>
                <span>
                  {formatGb(d.totalKb)} · {d.percent != null ? `${d.percent.toFixed(0)}%` : "–"}
                </span>
              </div>
            ))}
          </div>
        }
      />
    );
  }

  if (uptime) {
    items.push(
      <Tile
        key="uptime"
        icon={<Clock className="size-4" />}
        label={t("uptime")}
        value={uptime}
      />
    );
  }

  if (server.osName || server.kernelVersion) {
    items.push(
      <Tile
        key="os"
        icon={<Terminal className="size-4" />}
        label={t("system")}
        value={server.osName ?? "–"}
        sub={server.kernelVersion ?? undefined}
      />
    );
  }

  if (latest?.loadAvg1 != null) {
    items.push(
      <Tile
        key="load"
        icon={<Activity className="size-4" />}
        label={t("loadAverage")}
        value={[latest.loadAvg1, latest.loadAvg5, latest.loadAvg15]
          .map((v) => (v != null ? v.toFixed(2) : "–"))
          .join(" / ")}
      />
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap divide-x divide-border overflow-hidden rounded-lg border">
      {items}
    </div>
  );
}
