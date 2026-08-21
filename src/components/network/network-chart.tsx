"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslations } from "next-intl";

export interface NetworkChartPoint {
  timestamp: string;
  rx: number | null;
  tx: number | null;
}

const RX_COLOR = "#3b82f6";
const TX_COLOR = "#a855f7";

export function NetworkChart({
  data,
  formatValue,
  height = 160,
}: {
  data: NetworkChartPoint[];
  formatValue: (value: number) => string;
  height?: number | `${number}%`;
}) {
  const t = useTranslations("network.chart");
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(v) =>
            new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          }
          tick={{ fill: "currentColor", opacity: 0.5, fontSize: 10 }}
          minTickGap={40}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "currentColor", opacity: 0.5, fontSize: 10 }}
          width={56}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formatValue(v)}
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
          formatter={(value, name) => [formatValue(Number(value)), name]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line
          type="monotone"
          dataKey="rx"
          name={t("received")}
          stroke={RX_COLOR}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="tx"
          name={t("sent")}
          stroke={TX_COLOR}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
