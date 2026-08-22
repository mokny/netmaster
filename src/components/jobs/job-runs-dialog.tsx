"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { History, ChevronDown, ChevronRight } from "lucide-react";
import type { JobDTO, JobRunDTO, JobRunResultEntry, JobRunStatus } from "@/lib/job-types";

const STATUS_VARIANT: Record<JobRunStatus, "default" | "secondary" | "destructive" | "outline"> = {
  SUCCESS: "default",
  FAILED: "destructive",
  PARTIAL: "secondary",
  SKIPPED: "outline",
};

function formatDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return "-";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function RunRow({ run }: { run: JobRunDTO }) {
  const t = useTranslations("jobs.netmaster");
  const [expanded, setExpanded] = useState(false);
  let results: JobRunResultEntry[] = [];
  try {
    results = JSON.parse(run.resultsJson || "[]");
  } catch {
    results = [];
  }

  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          <span>{new Date(run.startedAt).toLocaleString()}</span>
          <Badge variant="outline">{t(`trigger.${run.trigger}`)}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {formatDuration(run.startedAt, run.finishedAt)}
          </span>
          <Badge variant={STATUS_VARIANT[run.status]}>{t(`runStatus.${run.status}`)}</Badge>
        </div>
      </button>
      {expanded && (
        <div className="space-y-2 border-t px-3 py-2">
          {run.error && <p className="text-xs text-destructive">{run.error}</p>}
          {results.length === 0 && !run.error && (
            <p className="text-xs text-muted-foreground">-</p>
          )}
          {results.map((r, i) => (
            <div key={i} className="space-y-1">
              {r.serverName && (
                <div className="flex items-center gap-2 text-xs font-medium">
                  {r.serverName}
                  <Badge variant={r.success ? "default" : "destructive"} className="text-[10px]">
                    {r.success ? t("runStatus.SUCCESS") : t("runStatus.FAILED")}
                  </Badge>
                </div>
              )}
              {r.output && (
                <pre className="max-h-40 overflow-auto rounded bg-muted/50 p-2 text-xs whitespace-pre-wrap">
                  {r.output}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function JobRunsDialog({ job }: { job: JobDTO }) {
  const t = useTranslations("jobs.netmaster");
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState<JobRunDTO[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setRuns(null);
    fetch(`/api/jobs/${job.id}/runs`)
      .then((res) => (res.ok ? res.json() : { runs: [] }))
      .then((data) => setRuns(data.runs ?? []));
  }, [open, job.id]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" className="size-6">
            <History className="size-3.5" />
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("runHistory")} - {job.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {runs === null ? (
            <p className="text-sm text-muted-foreground">…</p>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noRuns")}</p>
          ) : (
            runs.map((r) => <RunRow key={r.id} run={r} />)
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
