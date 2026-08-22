import { CronExpressionParser } from "cron-parser";
import { ApiError } from "@/lib/api-helpers";
import type { JobKind, JobScheduleType, PredefinedAction } from "@/generated/prisma/client";

const PREDEFINED_ACTIONS: PredefinedAction[] = [
  "RECONCILE_NOW",
  "CLEANUP_LOGS",
  "DB_BACKUP",
  "RUN_SERVICE_CHECKS",
];

export interface ValidatedJobInput {
  name: string;
  enabled: boolean;
  kind: JobKind;
  predefinedAction: PredefinedAction | null;
  command: string | null;
  targetServerIds: string[];
  scheduleType: JobScheduleType;
  intervalSec: number | null;
  cronExpression: string | null;
  timeoutSec: number;
}

export function validateJobInput(body: Record<string, unknown>): ValidatedJobInput {
  const name = String(body.name ?? "").trim();
  if (!name) throw new ApiError(400, "JOB_NAME_REQUIRED");

  const kind: JobKind = body.kind === "SSH_COMMAND" ? "SSH_COMMAND" : "PREDEFINED";

  let predefinedAction: PredefinedAction | null = null;
  let command: string | null = null;
  let targetServerIds: string[] = [];

  if (kind === "PREDEFINED") {
    predefinedAction = body.predefinedAction as PredefinedAction;
    if (!PREDEFINED_ACTIONS.includes(predefinedAction)) {
      throw new ApiError(400, "INVALID_PREDEFINED_ACTION");
    }
  } else {
    command = String(body.command ?? "").trim();
    if (!command) throw new ApiError(400, "JOB_COMMAND_REQUIRED");
    targetServerIds = Array.isArray(body.targetServerIds)
      ? body.targetServerIds.filter((id): id is string => typeof id === "string")
      : [];
    if (targetServerIds.length === 0) throw new ApiError(400, "JOB_TARGET_SERVER_REQUIRED");
  }

  const scheduleType: JobScheduleType = body.scheduleType === "CRON" ? "CRON" : "INTERVAL";
  let intervalSec: number | null = null;
  let cronExpression: string | null = null;

  if (scheduleType === "INTERVAL") {
    intervalSec = Number(body.intervalSec);
    if (!Number.isInteger(intervalSec) || intervalSec < 5 || intervalSec > 2_592_000) {
      throw new ApiError(400, "INVALID_JOB_INTERVAL");
    }
  } else {
    cronExpression = String(body.cronExpression ?? "").trim();
    try {
      CronExpressionParser.parse(cronExpression);
    } catch {
      throw new ApiError(400, "INVALID_CRON_EXPRESSION");
    }
  }

  const timeoutSec = Number(body.timeoutSec ?? 300);
  if (!Number.isInteger(timeoutSec) || timeoutSec < 5 || timeoutSec > 3600) {
    throw new ApiError(400, "INVALID_JOB_TIMEOUT");
  }

  return {
    name,
    enabled: body.enabled !== false,
    kind,
    predefinedAction,
    command,
    targetServerIds,
    scheduleType,
    intervalSec,
    cronExpression,
    timeoutSec,
  };
}
