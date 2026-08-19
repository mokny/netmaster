import { cn } from "@/lib/utils";

export type StatusValue = "UNKNOWN" | "OK" | "WARNING" | "CRITICAL";

const STATUS_STYLES: Record<StatusValue, string> = {
  OK: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  WARNING: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  CRITICAL: "bg-red-500/15 text-red-500 border-red-500/30",
  UNKNOWN: "bg-muted text-muted-foreground border-border",
};

const STATUS_LABELS: Record<StatusValue, string> = {
  OK: "OK",
  WARNING: "Warnung",
  CRITICAL: "Kritisch",
  UNKNOWN: "Unbekannt",
};

const STATUS_DOT: Record<StatusValue, string> = {
  OK: "bg-emerald-500",
  WARNING: "bg-amber-500",
  CRITICAL: "bg-red-500",
  UNKNOWN: "bg-muted-foreground",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const value = (status in STATUS_STYLES ? status : "UNKNOWN") as StatusValue;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[value],
        className
      )}
    >
      <span className={cn("size-1.5 rounded-full", STATUS_DOT[value])} />
      {STATUS_LABELS[value]}
    </span>
  );
}
