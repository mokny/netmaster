export type JobKind = "PREDEFINED" | "SSH_COMMAND";
export type JobScheduleType = "INTERVAL" | "CRON";
export type PredefinedAction = "RECONCILE_NOW" | "CLEANUP_LOGS" | "DB_BACKUP" | "RUN_SERVICE_CHECKS";
export type JobRunStatus = "SUCCESS" | "FAILED" | "PARTIAL" | "SKIPPED";
export type JobRunTrigger = "SCHEDULE" | "MANUAL";

export interface JobDTO {
  id: string;
  name: string;
  enabled: boolean;
  kind: JobKind;
  predefinedAction: PredefinedAction | null;
  command: string | null;
  targetServerIdsJson: string;
  scheduleType: JobScheduleType;
  intervalSec: number | null;
  cronExpression: string | null;
  timeoutSec: number;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  lastRunStatus: JobRunStatus | null;
}

export interface JobRunResultEntry {
  serverId?: string;
  serverName?: string;
  success: boolean;
  exitCode?: number | null;
  output?: string;
}

export interface JobRunDTO {
  id: string;
  jobId: string;
  status: JobRunStatus;
  trigger: JobRunTrigger;
  startedAt: string;
  finishedAt: string | null;
  resultsJson: string;
  error: string | null;
}

export const PREDEFINED_ACTIONS: PredefinedAction[] = [
  "RECONCILE_NOW",
  "CLEANUP_LOGS",
  "DB_BACKUP",
  "RUN_SERVICE_CHECKS",
];
