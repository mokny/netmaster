import type { Server as ServerModel } from "@/generated/prisma/client";
import type { ParsedMetrics } from "./parse";

export type StatusValue = "UNKNOWN" | "OK" | "WARNING" | "CRITICAL";

function worse(a: StatusValue, b: StatusValue): StatusValue {
  const rank: Record<StatusValue, number> = {
    UNKNOWN: 0,
    OK: 1,
    WARNING: 2,
    CRITICAL: 3,
  };
  return rank[a] >= rank[b] ? a : b;
}

export function computeServerStatus(
  server: Pick<
    ServerModel,
    "cpuWarn" | "cpuCrit" | "memWarn" | "memCrit" | "diskWarn" | "diskCrit"
  >,
  metrics: ParsedMetrics
): StatusValue {
  let status: StatusValue = "OK";

  const check = (value: number | null, warn: number, crit: number) => {
    if (value === null) return;
    if (value >= crit) status = worse(status, "CRITICAL");
    else if (value >= warn) status = worse(status, "WARNING");
  };

  check(metrics.cpuPercent, server.cpuWarn, server.cpuCrit);
  check(metrics.memPercent, server.memWarn, server.memCrit);
  check(metrics.diskPercent, server.diskWarn, server.diskCrit);

  return status;
}
