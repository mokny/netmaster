"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Loader2, Play, Trash2 } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { JobDialog } from "@/components/jobs/job-dialog";
import { JobRunsDialog } from "@/components/jobs/job-runs-dialog";
import type { JobDTO, JobRunStatus } from "@/lib/job-types";

const STATUS_VARIANT: Record<JobRunStatus, "default" | "secondary" | "destructive" | "outline"> = {
  SUCCESS: "default",
  FAILED: "destructive",
  PARTIAL: "secondary",
  SKIPPED: "outline",
};

function scheduleLabel(job: JobDTO): string {
  return job.scheduleType === "CRON" ? job.cronExpression ?? "" : `${job.intervalSec}s`;
}

export function NetmasterJobsTab() {
  const t = useTranslations("jobs.netmaster");
  const tTabs = useTranslations("jobs");
  const tErrors = useTranslations("errors");
  const [jobs, setJobs] = useState<JobDTO[] | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    const res = await fetch("/api/jobs");
    if (res.ok) setJobs((await res.json()).jobs);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleEnabled(job: JobDTO, enabled: boolean) {
    const res = await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: job.name,
        enabled,
        kind: job.kind,
        predefinedAction: job.predefinedAction ?? undefined,
        command: job.command ?? undefined,
        targetServerIds: job.targetServerIdsJson ? JSON.parse(job.targetServerIdsJson) : undefined,
        scheduleType: job.scheduleType,
        intervalSec: job.intervalSec ?? undefined,
        cronExpression: job.cronExpression ?? undefined,
        timeoutSec: job.timeoutSec,
      }),
    });
    if (!res.ok) {
      toast.error(t("saveFailed"));
      return;
    }
    load();
  }

  async function runNow(job: JobDTO) {
    setRunningId(job.id);
    try {
      const res = await fetch(`/api/jobs/${job.id}/run`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ? tErrors(data.error) : t("runFailed"));
        return;
      }
      toast.success(t("runTriggered"));
      load();
    } finally {
      setRunningId(null);
    }
  }

  async function deleteJob(job: JobDTO) {
    const ok = await confirm({ title: t("deleteConfirm"), variant: "destructive" });
    if (!ok) return;
    const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(t("deleteFailed"));
      return;
    }
    toast.success(t("jobDeleted"));
    load();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>{tTabs("tabs.netmaster")}</CardTitle>
        <JobDialog onSaved={load} />
      </CardHeader>
      <CardContent>
        {jobs === null ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noJobs")}</p>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{job.name}</p>
                    <Badge variant="outline" className="text-[10px]">
                      {job.kind === "PREDEFINED" ? t("kindPredefined") : t("kindSshCommand")}
                    </Badge>
                  </div>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {scheduleLabel(job)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {job.lastRunStatus && (
                    <Badge variant={STATUS_VARIANT[job.lastRunStatus]}>
                      {t(`runStatus.${job.lastRunStatus}`)}
                    </Badge>
                  )}
                  <Switch
                    checked={job.enabled}
                    onCheckedChange={(c) => toggleEnabled(job, !!c)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    disabled={runningId === job.id}
                    onClick={() => runNow(job)}
                    title={t("runNow")}
                  >
                    {runningId === job.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                  </Button>
                  <JobRunsDialog job={job} />
                  <JobDialog job={job} onSaved={load} />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => deleteJob(job)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
