"use client";

import { useState } from "react";
import Image from "next/image";
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
        toast.error(data.error ?? "Setup fehlgeschlagen");
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
        toast.error(data.error ?? "Code ungültig");
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
        title: "2FA deaktivieren",
        description: "2FA wirklich deaktivieren? Andere aktive Sessions werden beendet.",
        confirmText: "Deaktivieren",
        variant: "destructive",
      }))
    )
      return;
    setLoading(true);
    try {
      const res = await fetch("/api/account/totp/disable", { method: "POST" });
      if (!res.ok) {
        toast.error("Deaktivieren fehlgeschlagen");
        return;
      }
      toast.success("2FA deaktiviert");
      onChanged();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Zwei-Faktor-Authentifizierung (TOTP)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasPasskeys ? (
          <p className="text-sm text-muted-foreground">
            Nicht verfügbar, solange ein Passkey hinterlegt ist – dieser ersetzt Passwort- und
            2FA-Login vollständig.
          </p>
        ) : enabled ? (
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm">
              <ShieldCheck className="size-4 text-primary" />
              2FA ist aktiv.
            </p>
            <Button variant="outline" size="sm" disabled={loading} onClick={disable}>
              Deaktivieren
            </Button>
          </div>
        ) : setup ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Scanne den QR-Code mit deiner Authenticator-App und gib den angezeigten Code ein.
            </p>
            <Image
              src={setup.qrCodeDataUrl}
              alt="TOTP QR-Code"
              width={180}
              height={180}
              className="rounded-md border"
              unoptimized
            />
            <p className="text-xs text-muted-foreground">
              Manuell: <code className="rounded bg-muted px-1 py-0.5">{setup.secret}</code>
            </p>
            <div className="space-y-2">
              <Label>Bestätigungscode</Label>
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
                Aktivieren
              </Button>
              <Button variant="ghost" onClick={() => setSetup(null)}>
                Abbrechen
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">2FA ist derzeit nicht aktiv.</p>
            <Button size="sm" disabled={loading} onClick={startSetup}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              Einrichten
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={!!backupCodes} onOpenChange={(open) => !open && setBackupCodes(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Backup-Codes</DialogTitle>
            <DialogDescription>
              Bewahre diese Codes sicher auf. Jeder Code funktioniert einmalig als Ersatz für
              deinen Authenticator, falls du das Gerät verlierst. Sie werden nur jetzt angezeigt.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/40 p-3 font-mono text-sm">
            {backupCodes?.map((c) => <div key={c}>{c}</div>)}
          </div>
          <DialogFooter>
            <Button onClick={() => setBackupCodes(null)}>Verstanden, gespeichert</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
