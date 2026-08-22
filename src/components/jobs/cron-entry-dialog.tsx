"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus, Pencil } from "lucide-react";
import type { CronEntry } from "@/lib/cron-types";

export function CronEntryDialog({
  serverId,
  user,
  entry,
  onSaved,
}: {
  serverId: string;
  user: string;
  entry?: CronEntry;
  onSaved: () => void;
}) {
  const t = useTranslations("jobs.cron");
  const tErrors = useTranslations("errors");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [schedule, setSchedule] = useState(entry?.schedule ?? "0 3 * * *");
  const [command, setCommand] = useState(entry?.command ?? "");
  const [comment, setComment] = useState(entry?.comment ?? "");

  useEffect(() => {
    if (!open) return;
    setSchedule(entry?.schedule ?? "0 3 * * *");
    setCommand(entry?.command ?? "");
    setComment(entry?.comment ?? "");
  }, [open, entry]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const body = entry
        ? { user, schedule, command, comment, target: { id: entry.id, raw: entry.raw } }
        : { user, schedule, command, comment };
      const res = await fetch(`/api/cron/${serverId}`, {
        method: entry ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ? tErrors(data.error) : t("saveFailed"));
        return;
      }
      toast.success(entry ? t("entryUpdated") : t("entryAdded"));
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
          entry ? (
            <Button variant="ghost" size="icon" className="size-6">
              <Pencil className="size-3.5" />
            </Button>
          ) : (
            <Button size="sm">
              <Plus className="size-4" />
              {t("addEntry")}
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{entry ? t("editEntry") : t("addEntry")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label>{t("schedule")}</Label>
            <Input
              required
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="0 3 * * *"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">{t("scheduleHelp")}</p>
          </div>
          <div className="space-y-2">
            <Label>{t("command")}</Label>
            <textarea
              required
              rows={2}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 font-mono text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("label")}</Label>
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t("labelPlaceholder")}
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
