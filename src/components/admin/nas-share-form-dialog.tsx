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
import { FolderSearch, Loader2, Plus } from "lucide-react";
import type { NasShareDTO, ServerDTO } from "@/lib/types";
import { NasFolderBrowserDialog } from "./nas-folder-browser-dialog";

function bytesToGb(value: string | null): string {
  if (!value) return "";
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  return String(bytes / (1024 * 1024 * 1024));
}

export function NasShareFormDialog({
  servers,
  share,
  onSaved,
  trigger,
}: {
  servers: Pick<ServerDTO, "id" | "name" | "hostname">[];
  share?: NasShareDTO;
  onSaved: () => void;
  trigger?: React.ReactElement;
}) {
  const isEdit = Boolean(share);
  const t = useTranslations("admin.nasShareForm");
  const tErrors = useTranslations("errors");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [form, setForm] = useState({
    name: share?.name ?? "",
    serverId: share?.serverId ?? servers[0]?.id ?? "",
    remotePath: share?.remotePath ?? "",
    quotaGb: bytesToGb(share?.quotaBytes ?? null),
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(
        isEdit ? `/api/admin/nas/shares/${share!.id}` : "/api/admin/nas/shares",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            serverId: form.serverId,
            remotePath: form.remotePath,
            mountTransport: "SSHFS",
            quotaBytes: form.quotaGb ? Number(form.quotaGb) * 1024 * 1024 * 1024 : null,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        const message = tErrors(data.error ?? "INTERNAL_ERROR");
        toast.error(data.detail ? `${message}: ${data.detail}` : message);
        return;
      }
      toast.success(isEdit ? t("updated") : t("created"));
      setOpen(false);
      if (!isEdit) {
        setForm({ name: "", serverId: servers[0]?.id ?? "", remotePath: "", quotaGb: "" });
      }
      onSaved();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button size="sm" disabled={servers.length === 0}>
              <Plus className="size-4" />
              {t("createShare")}
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editTitle") : t("createTitle")}</DialogTitle>
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
              disabled={isEdit}
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
            <div className="flex gap-2">
              <Input
                required
                disabled={isEdit}
                placeholder="/srv/nas/team-fotos"
                value={form.remotePath}
                onChange={(e) => setForm((f) => ({ ...f, remotePath: e.target.value }))}
              />
              {!isEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={!form.serverId}
                  title={t("browse")}
                  onClick={() => setBrowserOpen(true)}
                >
                  <FolderSearch className="size-4" />
                </Button>
              )}
            </div>
            {!isEdit && <p className="text-xs text-muted-foreground">{t("sshfsHint")}</p>}
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
      <NasFolderBrowserDialog
        open={browserOpen}
        onOpenChange={setBrowserOpen}
        serverId={form.serverId}
        initialPath={form.remotePath}
        onSelect={(path) => {
          setForm((f) => ({ ...f, remotePath: path }));
          setBrowserOpen(false);
        }}
      />
    </Dialog>
  );
}
