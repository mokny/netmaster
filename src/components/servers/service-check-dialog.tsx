"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Loader2, Plus } from "lucide-react";

export function ServiceCheckDialog({
  serverId,
  onSaved,
}: {
  serverId: string;
  onSaved: () => void;
}) {
  const t = useTranslations("servers.serviceCheck");
  const tErrors = useTranslations("errors");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifyMe, setNotifyMe] = useState(false);
  const [form, setForm] = useState({
    name: "",
    url: "https://",
    checkType: "HTTP" as "HTTP" | "PING",
    expectedStatus: 200,
    intervalSec: 30,
    timeoutMs: 5000,
  });

  function setCheckType(checkType: "HTTP" | "PING") {
    setForm((f) => ({
      ...f,
      checkType,
      url: checkType === "PING" && f.url === "https://" ? "" : f.url,
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/checks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, notifyMe }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ? tErrors(data.error) : t("saveFailed"));
        return;
      }
      toast.success(t("healthCheckAdded"));
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
          <Button size="sm" variant="outline">
            <Plus className="size-4" />
            {t("httpCheck")}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addHealthCheck")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label>{t("type")}</Label>
            <Select value={form.checkType} onValueChange={(v) => setCheckType(v as "HTTP" | "PING")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="HTTP">HTTP</SelectItem>
                <SelectItem value="PING">{t("ping")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
            <Label>{form.checkType === "PING" ? "Host" : "URL"}</Label>
            <Input
              required
              type={form.checkType === "PING" ? "text" : "url"}
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder={form.checkType === "PING" ? "192.168.1.1" : undefined}
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
              <Label>{t("intervalSeconds")}</Label>
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
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label className="font-normal">{t("notifyOnFailure")}</Label>
            <Switch checked={notifyMe} onCheckedChange={(c) => setNotifyMe(!!c)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              {t("add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
