"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus } from "lucide-react";
import type { NasUserDTO } from "@/lib/types";
import { NasConnectTextDialog } from "./nas-connect-text-dialog";

function bytesToGb(value: string | null): string {
  if (!value) return "";
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  return String(bytes / (1024 * 1024 * 1024));
}

export function NasUserFormDialog({
  nasUser,
  onSaved,
  trigger,
}: {
  nasUser?: NasUserDTO;
  onSaved: () => void;
  trigger?: React.ReactElement;
}) {
  const isEdit = Boolean(nasUser);
  const t = useTranslations("admin.nasUserForm");
  const tErrors = useTranslations("errors");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    email: nasUser?.email ?? "",
    name: nasUser?.name ?? "",
    password: "",
    canCreatePublicLinks: nasUser?.canCreatePublicLinks ?? true,
    quotaGb: bytesToGb(nasUser?.quotaBytes ?? null),
  });
  // Nach erfolgreichem Setzen eines Passworts kurz gezeigt, damit der Admin
  // den echten Verbindungstext (inkl. Passwort) einmalig kopieren kann -
  // danach ist das Klartext-Passwort nirgends mehr abrufbar.
  const [revealPassword, setRevealPassword] = useState<{ email: string; name: string; password: string } | null>(
    null
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(
        isEdit ? `/api/admin/nas/users/${nasUser!.id}` : "/api/admin/nas/users",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            quotaBytes: form.quotaGb ? Number(form.quotaGb) * 1024 * 1024 * 1024 : null,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(tErrors(data.error ?? "INTERNAL_ERROR"));
        return;
      }
      toast.success(isEdit ? t("updated") : t("created"));
      setOpen(false);
      if (form.password) {
        setRevealPassword({ email: form.email, name: form.name, password: form.password });
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
            <Button size="sm">
              <Plus className="size-4" />
              {t("createUser")}
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
            <Label>{t("email")}</Label>
            <Input
              required
              type="email"
              disabled={isEdit}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>
              {t("password")}
              {isEdit && (
                <span className="ml-1 font-normal text-muted-foreground">
                  {t("passwordKeepHint")}
                </span>
              )}
            </Label>
            <Input
              type="password"
              required={!isEdit}
              minLength={8}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
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
            <p className="text-xs text-muted-foreground">{t("quotaHint")}</p>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label className="font-normal">{t("canCreatePublicLinks")}</Label>
            <Switch
              checked={form.canCreatePublicLinks}
              onCheckedChange={(v) => setForm((f) => ({ ...f, canCreatePublicLinks: v }))}
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
      {revealPassword && (
        <NasConnectTextDialog
          open={Boolean(revealPassword)}
          onOpenChange={(v) => {
            if (!v) setRevealPassword(null);
          }}
          nasUser={revealPassword}
          password={revealPassword.password}
        />
      )}
    </Dialog>
  );
}
