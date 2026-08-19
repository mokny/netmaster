export type ThresholdLevel = "ok" | "warn" | "crit";

export function thresholdLevel(
  value: number | null | undefined,
  warn: number,
  crit: number
): ThresholdLevel {
  if (value == null) return "ok";
  if (value >= crit) return "crit";
  if (value >= warn) return "warn";
  return "ok";
}

export const LEVEL_BAR_CLASS: Record<ThresholdLevel, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  crit: "bg-red-500",
};

export const LEVEL_TEXT_CLASS: Record<ThresholdLevel, string> = {
  ok: "text-emerald-500",
  warn: "text-amber-500",
  crit: "text-red-500",
};

// VMs haben keine eigenen Schwellenwerte wie Server (cpuWarn/cpuCrit, ...),
// daher feste generische Grenzen für die Widget-Einfärbung.
export const VM_GENERIC_WARN = 80;
export const VM_GENERIC_CRIT = 95;
