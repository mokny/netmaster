"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ChartPoint {
  timestamp: string;
  value: number | null;
}

const COLORS: Record<string, string> = {
  cpu: "#3b82f6",
  mem: "#a855f7",
  disk: "#f59e0b",
};

export function MetricChart({
  data,
  color = "cpu",
  unit = "%",
  height = 180,
  domain,
}: {
  data: ChartPoint[];
  color?: keyof typeof COLORS;
  unit?: string;
  height?: number | `${number}%`;
  domain?: [number, number];
}) {
  const stroke = COLORS[color] ?? COLORS.cpu;
  const gradientId = `grad-${color}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
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
          domain={domain ?? [0, 100]}
          className="text-xs"
          tick={{ fill: "currentColor", opacity: 0.5 }}
          width={36}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `${v}${unit}`}
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
          formatter={(value) => [`${Number(value).toFixed(1)}${unit}`, ""]}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={stroke}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
          connectNulls
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
