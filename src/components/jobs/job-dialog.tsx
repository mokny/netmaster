"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus, Pencil } from "lucide-react";
import type { JobDTO, JobKind, JobScheduleType, PredefinedAction } from "@/lib/job-types";
import { PREDEFINED_ACTIONS } from "@/lib/job-types";

interface ServerOption {
  id: string;
  name: string;
}

interface JobFormState {
  name: string;
  enabled: boolean;
  kind: JobKind;
  predefinedAction: PredefinedAction;
  command: string;
  targetServerIds: string[];
  scheduleType: JobScheduleType;
  intervalSec: number;
  cronExpression: string;
  timeoutSec: number;
}

function initialForm(job?: JobDTO): JobFormState {
  return {
    name: job?.name ?? "",
    enabled: job?.enabled ?? true,
    kind: job?.kind ?? "PREDEFINED",
    predefinedAction: job?.predefinedAction ?? "RECONCILE_NOW",
    command: job?.command ?? "",
    targetServerIds: job ? (JSON.parse(job.targetServerIdsJson || "[]") as string[]) : [],
    scheduleType: job?.scheduleType ?? "INTERVAL",
    intervalSec: job?.intervalSec ?? 3600,
    cronExpression: job?.cronExpression ?? "0 3 * * *",
    timeoutSec: job?.timeoutSec ?? 300,
  };
}

export function JobDialog({ job, onSaved }: { job?: JobDTO; onSaved: () => void }) {
  const t = useTranslations("jobs.netmaster");
  const tErrors = useTranslations("errors");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [form, setForm] = useState<JobFormState>(() => initialForm(job));

  useEffect(() => {
    if (!open) return;
    setForm(initialForm(job));
    fetch("/api/servers")
      .then((res) => (res.ok ? res.json() : { servers: [] }))
      .then((data) => setServers(data.servers ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggleServer(id: string, checked: boolean) {
    setForm((f) => ({
      ...f,
      targetServerIds: checked
        ? [...f.targetServerIds, id]
        : f.targetServerIds.filter((s) => s !== id),
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const body = {
        name: form.name,
        enabled: form.enabled,
        kind: form.kind,
        predefinedAction: form.kind === "PREDEFINED" ? form.predefinedAction : undefined,
        command: form.kind === "SSH_COMMAND" ? form.command : undefined,
        targetServerIds: form.kind === "SSH_COMMAND" ? form.targetServerIds : undefined,
        scheduleType: form.scheduleType,
        intervalSec: form.scheduleType === "INTERVAL" ? form.intervalSec : undefined,
        cronExpression: form.scheduleType === "CRON" ? form.cronExpression : undefined,
        timeoutSec: form.timeoutSec,
      };
      const res = await fetch(job ? `/api/jobs/${job.id}` : "/api/jobs", {
        method: job ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ? tErrors(data.error) : t("saveFailed"));
        return;
      }
      toast.success(job ? t("jobUpdated") : t("jobAdded"));
      setOpen(false);
      onSaved();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          job ? (
            <Button variant="ghost" size="icon" className="size-6">
              <Pencil className="size-3.5" />
            </Button>
          ) : (
            <Button size="sm">
              <Plus className="size-4" />
              {t("addJob")}
            </Button>
          )
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{job ? t("editJob") : t("addJob")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label>{t("name")}</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t("namePlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("kind")}</Label>
            <Select
              value={form.kind}
              onValueChange={(v) => setForm((f) => ({ ...f, kind: v as JobKind }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PREDEFINED">{t("kindPredefined")}</SelectItem>
                <SelectItem value="SSH_COMMAND">{t("kindSshCommand")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.kind === "PREDEFINED" ? (
            <div className="space-y-2">
              <Label>{t("predefinedAction")}</Label>
              <Select
                value={form.predefinedAction}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, predefinedAction: v as PredefinedAction }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PREDEFINED_ACTIONS.map((action) => (
                    <SelectItem key={action} value={action}>
                      {t(`action.${action}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>{t("command")}</Label>
                <textarea
                  required
                  rows={3}
                  value={form.command}
                  onChange={(e) => setForm((f) => ({ ...f, command: e.target.value }))}
                  placeholder={t("commandPlaceholder")}
                  className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 font-mono text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("targetServers")}</Label>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                  {servers.length === 0 && (
                    <p className="text-xs text-muted-foreground">{t("targetServersPlaceholder")}</p>
                  )}
                  {servers.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 py-0.5 text-sm">
                      <Checkbox
                        checked={form.targetServerIds.includes(s.id)}
                        onCheckedChange={(c) => toggleServer(s.id, !!c)}
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label>{t("scheduleType")}</Label>
            <Select
              value={form.scheduleType}
              onValueChange={(v) => setForm((f) => ({ ...f, scheduleType: v as JobScheduleType }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INTERVAL">{t("scheduleInterval")}</SelectItem>
                <SelectItem value="CRON">{t("scheduleCron")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.scheduleType === "INTERVAL" ? (
            <div className="space-y-2">
              <Label>{t("intervalSec")}</Label>
              <Input
                type="number"
                min={5}
                value={form.intervalSec}
                onChange={(e) => setForm((f) => ({ ...f, intervalSec: Number(e.target.value) }))}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>{t("cronExpression")}</Label>
              <Input
                required
                value={form.cronExpression}
                onChange={(e) => setForm((f) => ({ ...f, cronExpression: e.target.value }))}
                placeholder={t("cronExpressionPlaceholder")}
                className="font-mono"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>{t("timeoutSec")}</Label>
            <Input
              type="number"
              min={5}
              max={3600}
              value={form.timeoutSec}
              onChange={(e) => setForm((f) => ({ ...f, timeoutSec: Number(e.target.value) }))}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label className="font-normal">{t("enabled")}</Label>
            <Switch
              checked={form.enabled}
              onCheckedChange={(c) => setForm((f) => ({ ...f, enabled: !!c }))}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              {tc("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
