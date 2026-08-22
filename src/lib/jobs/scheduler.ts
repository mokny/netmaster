import { CronExpressionParser } from "cron-parser";
import { prisma } from "@/lib/prisma";
import { runJob, recordSkippedRun } from "./run-job";
import type { Job } from "@/generated/prisma/client";

// Ein Timer pro Job - bei INTERVAL ein normaler setInterval, bei CRON ein
// setTimeout, das sich nach jedem Feuern selbst auf den nächsten
// Cron-Zeitpunkt neu einplant (ein fester Interval-Timer kann eine
// Cron-Wiederholung mit ungleichen Abständen nicht abbilden).
const jobTimers = new Map<string, NodeJS.Timeout>();
const jobConfigs = new Map<string, string>();
// Jobs, die gerade laufen - verhindert überlappende Ausführungen desselben
// Jobs (z.B. zwei parallele Backups), siehe fireJob/triggerJobManually.
const runningJobs = new Set<string>();

function clearJobTimer(jobId: string) {
  const timer = jobTimers.get(jobId);
  if (timer) {
    clearTimeout(timer);
    jobTimers.delete(jobId);
  }
}

async function fireJob(job: Job) {
  if (runningJobs.has(job.id)) {
    await recordSkippedRun(job.id);
    return;
  }
  runningJobs.add(job.id);
  try {
    await runJob(job, "SCHEDULE");
  } finally {
    runningJobs.delete(job.id);
  }
}

function scheduleCronJob(job: Job) {
  clearJobTimer(job.id);
  if (!job.cronExpression) return;
  let next: Date;
  try {
    next = CronExpressionParser.parse(job.cronExpression).next().toDate();
  } catch {
    return;
  }
  const delay = Math.max(1000, next.getTime() - Date.now());
  const timer = setTimeout(async () => {
    await fireJob(job);
    const fresh = await prisma.job.findUnique({ where: { id: job.id } });
    if (fresh && fresh.enabled && fresh.scheduleType === "CRON") {
      scheduleCronJob(fresh);
    } else {
      jobTimers.delete(job.id);
    }
  }, delay);
  jobTimers.set(job.id, timer);
}

function scheduleIntervalJob(job: Job) {
  clearJobTimer(job.id);
  const ms = Math.max(5, job.intervalSec ?? 60) * 1000;
  const timer = setInterval(() => void fireJob(job), ms);
  jobTimers.set(job.id, timer);
}

export async function reconcileJobs() {
  const jobs = await prisma.job.findMany();
  const activeIds = new Set(jobs.map((j) => j.id));

  for (const job of jobs) {
    const config = `${job.enabled}:${job.scheduleType}:${job.intervalSec}:${job.cronExpression}`;
    if (jobConfigs.get(job.id) === config) continue;
    jobConfigs.set(job.id, config);
    clearJobTimer(job.id);
    if (!job.enabled) continue;
    if (job.scheduleType === "CRON") scheduleCronJob(job);
    else scheduleIntervalJob(job);
  }

  for (const id of jobConfigs.keys()) {
    if (!activeIds.has(id)) {
      clearJobTimer(id);
      jobConfigs.delete(id);
      runningJobs.delete(id);
    }
  }
}

export function stopJobScheduler() {
  for (const id of jobTimers.keys()) clearJobTimer(id);
  jobConfigs.clear();
  runningJobs.clear();
}

export function isJobRunning(jobId: string): boolean {
  return runningJobs.has(jobId);
}

// Manuelles "Jetzt ausführen" - respektiert denselben Überlappungsschutz wie
// die planmäßige Ausführung, statt parallel zu einem laufenden Lauf zu
// starten.
export async function triggerJobManually(job: Job) {
  if (runningJobs.has(job.id)) {
    throw new Error("JOB_ALREADY_RUNNING");
  }
  runningJobs.add(job.id);
  try {
    return await runJob(job, "MANUAL");
  } finally {
    runningJobs.delete(job.id);
  }
}
