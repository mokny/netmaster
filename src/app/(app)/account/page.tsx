"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SessionsList } from "@/components/account/sessions-list";
import { TotpSetupCard } from "@/components/account/totp-setup-card";
import { PasskeyCard } from "@/components/account/passkey-card";
import { useSession } from "@/hooks/use-session";
import { Loader2 } from "lucide-react";
import type { SessionDTO, PasskeyDTO } from "@/lib/types";

export default function AccountPage() {
  const session = useSession();
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
      toast.error("Passwort muss mindestens 8 Zeichen lang sein");
      return;
    }
    if (password !== passwordConfirm) {
      toast.error("Passwörter stimmen nicht überein");
      return;
    }

    const revokeOtherSessions = confirm(
      "Passwort wurde geändert. Sollen alle anderen aktiven Sessions (andere Geräte/Browser) jetzt beendet werden?"
    );

    setSaving(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, revokeOtherSessions }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Ändern fehlgeschlagen");
        return;
      }
      toast.success("Passwort geändert");
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
      toast.error("Beenden fehlgeschlagen");
      return;
    }
    if (isCurrent) {
      window.location.href = "/login";
      return;
    }
    toast.success("Session beendet");
    loadSessions();
  }

  async function revokeOtherSessions() {
    if (!confirm("Alle anderen Sessions wirklich beenden?")) return;
    const res = await fetch("/api/account/sessions", { method: "DELETE" });
    if (res.ok) {
      toast.success("Andere Sessions beendet");
      loadSessions();
    } else {
      toast.error("Beenden fehlgeschlagen");
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Konto</h1>
        <p className="text-sm text-muted-foreground">
          {session ? `${session.name} · ${session.email}` : "Passwort und aktive Sessions verwalten."}
        </p>
      </div>

      {passkeys.length === 0 && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Passwort ändern</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-3">
            <div className="space-y-2">
              <Label>Neues Passwort</Label>
              <Input
                type="password"
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Neues Passwort bestätigen</Label>
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
              Passwort ändern
            </Button>
          </form>
        </CardContent>
      </Card>
      )}

      <PasskeyCard passkeys={passkeys} onChanged={loadSecurity} />

      <TotpSetupCard
        enabled={totpEnabled}
        hasPasskeys={passkeys.length > 0}
        onChanged={loadSecurity}
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Aktive Sessions</CardTitle>
          {sessions && sessions.length > 1 && (
            <Button variant="outline" size="sm" onClick={revokeOtherSessions}>
              Alle anderen beenden
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
