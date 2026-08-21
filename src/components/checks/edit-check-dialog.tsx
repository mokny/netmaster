"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Loader2, Pencil } from "lucide-react";
import type { ServiceCheckDTO } from "@/lib/types";
import { useTranslations } from "next-intl";

export function EditCheckDialog({
  check,
  onSaved,
}: {
  check: ServiceCheckDTO;
  onSaved: () => void;
}) {
  const t = useTranslations("checks.editDialog");
  const tErrors = useTranslations("errors");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: check.name,
    url: check.url,
    checkType: check.checkType,
    expectedStatus: check.expectedStatus,
    intervalSec: check.intervalSec,
    timeoutMs: check.timeoutMs,
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/checks/${check.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ? tErrors(data.error) : t("saveFailed"));
        return;
      }
      toast.success(t("checkUpdated"));
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
          <Button variant="ghost" size="icon" className="size-6">
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label>{t("type")}</Label>
            <Select
              value={form.checkType}
              onValueChange={(v) => setForm((f) => ({ ...f, checkType: v as "HTTP" | "PING" }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="HTTP">HTTP</SelectItem>
                <SelectItem value="PING">Ping</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{tc("name")}</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>{form.checkType === "PING" ? "Host" : "URL"}</Label>
            <Input
              required
              type={form.checkType === "PING" ? "text" : "url"}
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {form.checkType === "HTTP" && (
              <div className="space-y-2">
                <Label>{t("expectedStatus")}</Label>
                <Input
                  type="number"
                  value={form.expectedStatus}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, expectedStatus: Number(e.target.value) }))
                  }
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>{t("intervalSec")}</Label>
              <Input
                type="number"
                value={form.intervalSec}
                onChange={(e) =>
                  setForm((f) => ({ ...f, intervalSec: Number(e.target.value) }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("timeoutMs")}</Label>
              <Input
                type="number"
                value={form.timeoutMs}
                onChange={(e) =>
                  setForm((f) => ({ ...f, timeoutMs: Number(e.target.value) }))
                }
              />
            </div>
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
