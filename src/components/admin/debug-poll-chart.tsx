"use client";

import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";

export interface DebugMetricPoint {
  ts: number;
  cpuPercent: number | null;
  memPercent: number | null;
  diskPercent: number | null;
}

export interface PollLogEntry {
  id: string;
  pollType: string;
  timestamp: string;
  success: boolean;
}

export const POLL_TYPES = [
  "host_metrics",
  "docker_containers",
  "docker_images",
  "proxmox_vms",
  "ping",
  "on_demand",
] as const;

export type PollTypeName = (typeof POLL_TYPES)[number];

export const POLL_TYPE_COLORS: Record<PollTypeName, string> = {
  host_metrics: "#3b82f6",
  docker_containers: "#10b981",
  docker_images: "#06b6d4",
  proxmox_vms: "#a855f7",
  ping: "#f59e0b",
  on_demand: "#ec4899",
};

export const POLL_TYPE_LABELS: Record<PollTypeName, string> = {
  host_metrics: "Host metrics",
  docker_containers: "Docker containers",
  docker_images: "Docker images",
  proxmox_vms: "Proxmox VMs/LXCs",
  ping: "Ping",
  on_demand: "On-demand",
};

// Ping startet ausgeblendet - läuft alle 15s, würde bei "letzte Stunde" bis
// zu 240 Linien erzeugen und den Graphen überladen.
const DEFAULT_VISIBLE: Record<PollTypeName, boolean> = {
  host_metrics: true,
  docker_containers: true,
  docker_images: true,
  proxmox_vms: true,
  ping: false,
  on_demand: true,
};

const CPU_COLOR = "#3b82f6";
const MEM_COLOR = "#a855f7";
const DISK_COLOR = "#f59e0b";

export function usePollTypeVisibility() {
  return useState<Record<PollTypeName, boolean>>(DEFAULT_VISIBLE);
}

export function PollTypeLegend({
  visible,
  onToggle,
}: {
  visible: Record<PollTypeName, boolean>;
  onToggle: (type: PollTypeName) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      {POLL_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onToggle(type)}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2 py-1 transition-opacity",
            !visible[type] && "opacity-40"
          )}
        >
          <span className="size-2.5 rounded-full" style={{ backgroundColor: POLL_TYPE_COLORS[type] }} />
          {POLL_TYPE_LABELS[type]}
        </button>
      ))}
    </div>
  );
}

export function DebugPollChart({
  data,
  pollLog,
  visible,
  from,
  to,
  height = 360,
}: {
  data: DebugMetricPoint[];
  pollLog: PollLogEntry[];
  visible: Record<PollTypeName, boolean>;
  from: number;
  to: number;
  height?: number;
}) {
  const visibleEntries = pollLog.filter((e) =>
    visible[e.pollType as PollTypeName] === true && POLL_TYPES.includes(e.pollType as PollTypeName)
  );

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="grad-debug-cpu" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CPU_COLOR} stopOpacity={0.3} />
              <stop offset="100%" stopColor={CPU_COLOR} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="grad-debug-mem" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={MEM_COLOR} stopOpacity={0.3} />
              <stop offset="100%" stopColor={MEM_COLOR} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis
            dataKey="ts"
            type="number"
            domain={[from, to]}
            scale="time"
            tickFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            tick={{ fill: "currentColor", opacity: 0.5, fontSize: 10 }}
            minTickGap={40}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "currentColor", opacity: 0.5, fontSize: 10 }}
            width={36}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              borderColor: "var(--border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--popover-foreground)",
            }}
            labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
            formatter={(value, name) => [value == null ? "–" : `${Number(value).toFixed(1)}%`, name]}
          />
          <Area
            type="monotone"
            dataKey="cpuPercent"
            name="CPU"
            stroke={CPU_COLOR}
            strokeWidth={2}
            fill="url(#grad-debug-cpu)"
            isAnimationActive={false}
            connectNulls
          />
          <Area
            type="monotone"
            dataKey="memPercent"
            name="RAM"
            stroke={MEM_COLOR}
            strokeWidth={2}
            fill="url(#grad-debug-mem)"
            isAnimationActive={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="diskPercent"
            name="Disk"
            stroke={DISK_COLOR}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          {visibleEntries.map((entry) => (
            <ReferenceLine
              key={entry.id}
              x={new Date(entry.timestamp).getTime()}
              stroke={POLL_TYPE_COLORS[entry.pollType as PollTypeName]}
              strokeDasharray={entry.success ? undefined : "4 3"}
              strokeOpacity={0.8}
              ifOverflow="visible"
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
