import { cn } from "@/lib/utils";
import { thresholdLevel, LEVEL_BAR_CLASS, LEVEL_TEXT_CLASS } from "@/lib/thresholds";

export function MetricBar({
  label,
  value,
  warn,
  crit,
}: {
  label: string;
  value: number | null;
  warn: number;
  crit: number;
}) {
  const level = thresholdLevel(value, warn, crit);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={cn("text-sm font-semibold tabular-nums", LEVEL_TEXT_CLASS[level])}>
          {value != null ? `${value.toFixed(1)}%` : "–"}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", LEVEL_BAR_CLASS[level])}
          style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }}
        />
      </div>
    </div>
  );
}
