"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type StatusValue = "UNKNOWN" | "OK" | "WARNING" | "CRITICAL";

const STATUS_STYLES: Record<StatusValue, string> = {
  OK: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  WARNING: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  CRITICAL: "bg-red-500/15 text-red-500 border-red-500/30",
  UNKNOWN: "bg-muted text-muted-foreground border-border",
};

const STATUS_LABEL_KEYS: Record<StatusValue, string> = {
  OK: "ok",
  WARNING: "warning",
  CRITICAL: "critical",
  UNKNOWN: "unknown",
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
  onClick,
}: {
  status: string;
  className?: string;
  // Wird nur bei WARNING/CRITICAL aufgerufen - das Badge selbst entscheidet,
  // ob es für den jeweiligen Status überhaupt interaktiv sein soll.
  onClick?: () => void;
}) {
  const t = useTranslations("status");
  const value = (status in STATUS_STYLES ? status : "UNKNOWN") as StatusValue;
  const clickable = Boolean(onClick) && (value === "WARNING" || value === "CRITICAL");
  return (
    <span
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={
        clickable
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onClick!();
            }
          : undefined
      }
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              e.stopPropagation();
              onClick!();
            }
          : undefined
      }
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        clickable && "cursor-pointer hover:brightness-125",
        STATUS_STYLES[value],
        className
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[value])} />
      <span className="truncate">{t(STATUS_LABEL_KEYS[value])}</span>
    </span>
  );
}
