"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Loader2, ShieldCheck } from "lucide-react";

type SetupState = { secret: string; qrCodeDataUrl: string } | null;

export function TotpSetupCard({
  enabled,
  hasPasskeys,
  onChanged,
}: {
  enabled: boolean;
  hasPasskeys: boolean;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const t = useTranslations("account.totp");
  const tErrors = useTranslations("errors");
  const [setup, setSetup] = useState<SetupState>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  async function startSetup() {
    setLoading(true);
    try {
      const res = await fetch("/api/account/totp/setup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(tErrors(data.error ?? "INTERNAL_ERROR"));
        return;
      }
      setSetup(data);
    } finally {
      setLoading(false);
    }
  }

  async function confirmSetup() {
    setLoading(true);
    try {
      const res = await fetch("/api/account/totp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(tErrors(data.error ?? "INVALID_TOTP_CODE"));
        return;
      }
      setSetup(null);
      setCode("");
      setBackupCodes(data.backupCodes);
      onChanged();
    } finally {
      setLoading(false);
    }
  }

  async function disable() {
    if (
      !(await confirm({
        title: t("disableTitle"),
        description: t("disableDescription"),
        confirmText: t("disable"),
        variant: "destructive",
      }))
    )
      return;
    setLoading(true);
    try {
      const res = await fetch("/api/account/totp/disable", { method: "POST" });
      if (!res.ok) {
        toast.error(t("disableFailed"));
        return;
      }
      toast.success(t("disabled"));
      onChanged();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasPasskeys ? (
          <p className="text-sm text-muted-foreground">{t("unavailableWithPasskey")}</p>
        ) : enabled ? (
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm">
              <ShieldCheck className="size-4 text-primary" />
              {t("active")}
            </p>
            <Button variant="outline" size="sm" disabled={loading} onClick={disable}>
              {t("disable")}
            </Button>
          </div>
        ) : setup ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("scanHint")}</p>
            <Image
              src={setup.qrCodeDataUrl}
              alt={t("qrCodeAlt")}
              width={180}
              height={180}
              className="rounded-md border"
              unoptimized
            />
            <p className="text-xs text-muted-foreground">
              {t("manual")} <code className="rounded bg-muted px-1 py-0.5">{setup.secret}</code>
            </p>
            <div className="space-y-2">
              <Label>{t("confirmationCode")}</Label>
              <Input
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmSetup();
                }}
              />
            </div>
            <div className="flex gap-2">
              <Button disabled={loading || !code} onClick={confirmSetup}>
                {loading && <Loader2 className="size-4 animate-spin" />}
                {t("enable")}
              </Button>
              <Button variant="ghost" onClick={() => setSetup(null)}>
                {t("cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{t("inactive")}</p>
            <Button size="sm" disabled={loading} onClick={startSetup}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              {t("setUp")}
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={!!backupCodes} onOpenChange={(open) => !open && setBackupCodes(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("backupCodes")}</DialogTitle>
            <DialogDescription>{t("backupCodesDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/40 p-3 font-mono text-sm">
            {backupCodes?.map((c) => <div key={c}>{c}</div>)}
          </div>
          <DialogFooter>
            <Button onClick={() => setBackupCodes(null)}>{t("backupCodesSaved")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
