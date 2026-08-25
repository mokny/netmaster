"use client";

import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus } from "lucide-react";
import type { ServerDTO } from "@/lib/types";

export function NasShareFormDialog({
  servers,
  onSaved,
}: {
  servers: Pick<ServerDTO, "id" | "name" | "hostname">[];
  onSaved: () => void;
}) {
  const t = useTranslations("admin.nasShareForm");
  const tErrors = useTranslations("errors");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    serverId: servers[0]?.id ?? "",
    remotePath: "",
    mountTransport: "SSHFS" as "SSHFS" | "NFS",
    quotaGb: "",
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/admin/nas/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          serverId: form.serverId,
          remotePath: form.remotePath,
          mountTransport: form.mountTransport,
          quotaBytes: form.quotaGb ? Number(form.quotaGb) * 1024 * 1024 * 1024 : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(tErrors(data.error ?? "INTERNAL_ERROR"));
        return;
      }
      toast.success(t("created"));
      setOpen(false);
      setForm({ name: "", serverId: servers[0]?.id ?? "", remotePath: "", mountTransport: "SSHFS", quotaGb: "" });
      onSaved();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" disabled={servers.length === 0}>
            <Plus className="size-4" />
            {t("createShare")}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label>{t("name")}</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("server")}</Label>
            <Select
              value={form.serverId}
              onValueChange={(v) => setForm((f) => ({ ...f, serverId: v ?? "" }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {servers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.hostname})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("serverHint")}</p>
          </div>
          <div className="space-y-2">
            <Label>{t("remotePath")}</Label>
            <Input
              required
              placeholder="/srv/nas/team-fotos"
              value={form.remotePath}
              onChange={(e) => setForm((f) => ({ ...f, remotePath: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("mountTransport")}</Label>
            <Select
              value={form.mountTransport}
              onValueChange={(v) => setForm((f) => ({ ...f, mountTransport: v as "SSHFS" | "NFS" }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SSHFS">SSHFS</SelectItem>
                <SelectItem value="NFS">NFS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("quotaGb")}</Label>
            <Input
              type="number"
              min={0}
              placeholder={t("quotaUnlimited")}
              value={form.quotaGb}
              onChange={(e) => setForm((f) => ({ ...f, quotaGb: e.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
