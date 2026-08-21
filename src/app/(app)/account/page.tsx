"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SessionsList } from "@/components/account/sessions-list";
import { TotpSetupCard } from "@/components/account/totp-setup-card";
import { PasskeyCard } from "@/components/account/passkey-card";
import { PushNotificationsCard } from "@/components/account/push-notifications-card";
import { WakeLockCard } from "@/components/account/wake-lock-card";
import { useSession } from "@/hooks/use-session";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Loader2 } from "lucide-react";
import type { SessionDTO, PasskeyDTO } from "@/lib/types";

export default function AccountPage() {
  const session = useSession();
  const confirm = useConfirm();
  const t = useTranslations("account");
  const tErrors = useTranslations("errors");
  const [sessions, setSessions] = useState<SessionDTO[] | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [passkeys, setPasskeys] = useState<PasskeyDTO[]>([]);

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/account/sessions");
    if (res.ok) setSessions((await res.json()).sessions);
  }, []);

  const loadSecurity = useCallback(async () => {
    const res = await fetch("/api/account/security");
    if (res.ok) {
      const data = await res.json();
      setTotpEnabled(data.totpEnabled);
      setPasskeys(data.passkeys);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    loadSecurity();
  }, [loadSessions, loadSecurity]);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error(t("passwordTooShort"));
      return;
    }
    if (password !== passwordConfirm) {
      toast.error(t("passwordMismatch"));
      return;
    }

    const revokeOtherSessions = await confirm({
      title: t("passwordChangedTitle"),
      description: t("passwordChangedDescription"),
      confirmText: t("end"),
      cancelText: t("dontEnd"),
    });

    setSaving(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, revokeOtherSessions }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(tErrors(data.error ?? "INTERNAL_ERROR"));
        return;
      }
      toast.success(t("passwordChanged"));
      setPassword("");
      setPasswordConfirm("");
      loadSessions();
    } finally {
      setSaving(false);
    }
  }

  async function revokeSession(id: string) {
    const isCurrent = sessions?.find((s) => s.id === id)?.isCurrent ?? false;
    const res = await fetch(`/api/account/sessions/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(t("endFailed"));
      return;
    }
    if (isCurrent) {
      window.location.href = "/login";
      return;
    }
    toast.success(t("sessionEnded"));
    loadSessions();
  }

  async function revokeOtherSessions() {
    if (
      !(await confirm({
        title: t("endSessionsTitle"),
        description: t("endSessionsDescription"),
        confirmText: t("end"),
        variant: "destructive",
      }))
    )
      return;
    const res = await fetch("/api/account/sessions", { method: "DELETE" });
    if (res.ok) {
      toast.success(t("otherSessionsEnded"));
      loadSessions();
    } else {
      toast.error(t("endFailed"));
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {session ? `${session.name} · ${session.email}` : t("subtitle")}
        </p>
      </div>

      {passkeys.length === 0 && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("changePassword")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-3">
            <div className="space-y-2">
              <Label>{t("newPassword")}</Label>
              <Input
                type="password"
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("confirmNewPassword")}</Label>
              <Input
                type="password"
                minLength={8}
                required
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {t("changePassword")}
            </Button>
          </form>
        </CardContent>
      </Card>
      )}

      <PasskeyCard passkeys={passkeys} onChanged={loadSecurity} />

      <PushNotificationsCard />

      <WakeLockCard />

      <TotpSetupCard
        enabled={totpEnabled}
        hasPasskeys={passkeys.length > 0}
        onChanged={loadSecurity}
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{t("activeSessions")}</CardTitle>
          {sessions && sessions.length > 1 && (
            <Button variant="outline" size="sm" onClick={revokeOtherSessions}>
              {t("endAllOthers")}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {sessions === null ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <SessionsList sessions={sessions} onRevoke={revokeSession} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
