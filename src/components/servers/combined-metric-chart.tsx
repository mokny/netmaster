"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface CombinedPoint {
  timestamp: string;
  cpuPercent: number | null;
  memPercent: number | null;
  [diskKey: string]: string | number | null;
}

export const DISK_KEY_PREFIX = "disk:";

const CPU_COLOR = "#3b82f6";
const MEM_COLOR = "#a855f7";
const DISK_COLORS = [
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
];

export function diskColor(index: number) {
  return DISK_COLORS[index % DISK_COLORS.length];
}

export function CombinedMetricChart({
  data,
  diskLines,
  height = 320,
}: {
  data: CombinedPoint[];
  diskLines: { key: string; label: string }[];
  height?: number | `${number}%`;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="grad-cpu-combined" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CPU_COLOR} stopOpacity={0.3} />
            <stop offset="100%" stopColor={CPU_COLOR} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="grad-mem-combined" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={MEM_COLOR} stopOpacity={0.3} />
            <stop offset="100%" stopColor={MEM_COLOR} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(v) =>
            new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          }
          className="text-xs"
          tick={{ fill: "currentColor", opacity: 0.5 }}
          minTickGap={40}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          className="text-xs"
          tick={{ fill: "currentColor", opacity: 0.5 }}
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
          labelFormatter={(v) => new Date(String(v)).toLocaleString()}
          formatter={(value, name) => [
            value == null ? "–" : `${Number(value).toFixed(1)}%`,
            name,
          ]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area
          type="monotone"
          dataKey="cpuPercent"
          name="CPU"
          stroke={CPU_COLOR}
          strokeWidth={2}
          fill="url(#grad-cpu-combined)"
          isAnimationActive={false}
          connectNulls
        />
        <Area
          type="monotone"
          dataKey="memPercent"
          name="RAM"
          stroke={MEM_COLOR}
          strokeWidth={2}
          fill="url(#grad-mem-combined)"
          isAnimationActive={false}
          connectNulls
        />
        {diskLines.map((d, i) => (
          <Line
            key={d.key}
            type="monotone"
            dataKey={d.key}
            name={d.label}
            stroke={diskColor(i)}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
