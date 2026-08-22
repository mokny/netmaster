import { prisma } from "@/lib/prisma";
import { execOnServer } from "@/lib/ssh";
import { runPredefinedAction } from "./predefined-actions";
import type { Job, JobRun, JobRunTrigger, JobRunStatus } from "@/generated/prisma/client";

interface SshTargetResult {
  serverId: string;
  serverName: string;
  success: boolean;
  exitCode: number | null;
  output: string;
}

const MAX_OUTPUT_CHARS = 20_000;

function truncate(text: string): string {
  return text.length > MAX_OUTPUT_CHARS
    ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n… (truncated)`
    : text;
}

async function runSshCommandJob(job: Job): Promise<{ status: JobRunStatus; resultsJson: string }> {
  const serverIds: string[] = JSON.parse(job.targetServerIdsJson || "[]");
  const servers = await prisma.server.findMany({ where: { id: { in: serverIds } } });

  const results: SshTargetResult[] = await Promise.all(
    servers.map(async (server): Promise<SshTargetResult> => {
      try {
        const res = await execOnServer(server, job.command ?? "", job.timeoutSec * 1000);
        return {
          serverId: server.id,
          serverName: server.name,
          success: res.code === 0,
          exitCode: res.code,
          output: truncate(res.stdout + (res.stderr ? `\n${res.stderr}` : "")),
        };
      } catch (err) {
        return {
          serverId: server.id,
          serverName: server.name,
          success: false,
          exitCode: null,
          output: err instanceof Error ? err.message : String(err),
        };
      }
    })
  );

  const successCount = results.filter((r) => r.success).length;
  const status: JobRunStatus =
    results.length === 0 || successCount === results.length
      ? "SUCCESS"
      : successCount === 0
        ? "FAILED"
        : "PARTIAL";

  return { status, resultsJson: JSON.stringify(results) };
}

export async function runJob(job: Job, trigger: JobRunTrigger): Promise<JobRun> {
  const startedAt = new Date();
  let status: JobRunStatus = "SUCCESS";
  let resultsJson = "[]";
  let error: string | undefined;

  try {
    if (job.kind === "PREDEFINED") {
      if (!job.predefinedAction) throw new Error("Job has no predefined action configured");
      const output = await runPredefinedAction(job.predefinedAction);
      resultsJson = JSON.stringify([{ success: true, output }]);
    } else {
      const result = await runSshCommandJob(job);
      status = result.status;
      resultsJson = result.resultsJson;
    }
  } catch (err) {
    status = "FAILED";
    error = err instanceof Error ? err.message : String(err);
  }

  const finishedAt = new Date();
  const run = await prisma.jobRun.create({
    data: { jobId: job.id, status, trigger, startedAt, finishedAt, resultsJson, error },
  });
  await prisma.job.update({
    where: { id: job.id },
    data: { lastRunAt: finishedAt, lastRunStatus: status },
  });
  return run;
}

export async function recordSkippedRun(jobId: string): Promise<void> {
  await prisma.jobRun.create({
    data: { jobId, status: "SKIPPED", trigger: "SCHEDULE", finishedAt: new Date() },
  });
}
