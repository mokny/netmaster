"use client";

import { useState } from "react";
import { toast } from "sonner";
import { startRegistration } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PasskeyList } from "@/components/account/passkey-list";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { usePrompt } from "@/components/ui/prompt-dialog";
import { Loader2, Fingerprint } from "lucide-react";
import type { PasskeyDTO } from "@/lib/types";

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

function isIpHost(): boolean {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  return hostname !== "localhost" && (IPV4_RE.test(hostname) || hostname.includes(":"));
}

export function PasskeyCard({
  passkeys,
  onChanged,
}: {
  passkeys: PasskeyDTO[];
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [loading, setLoading] = useState(false);
  const ipHost = isIpHost();

  async function addPasskey() {
    const name = await prompt({
      title: "Passkey hinzufügen",
      label: "Name für diesen Passkey",
      placeholder: "z.B. MacBook Pro",
      defaultValue: "Neues Gerät",
      confirmText: "Weiter",
    });
    if (name === null) return;

    setLoading(true);
    try {
      const optionsRes = await fetch("/api/account/webauthn/register/options", {
        method: "POST",
      });
      const options = await optionsRes.json();
      if (!optionsRes.ok) {
        toast.error(options.error ?? "Passkey-Setup nicht verfügbar");
        return;
      }

      const response = await startRegistration({ optionsJSON: options });

      const verifyRes = await fetch("/api/account/webauthn/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response, name }),
      });
      const data = await verifyRes.json();
      if (!verifyRes.ok) {
        toast.error(data.error ?? "Passkey konnte nicht angelegt werden");
        return;
      }
      toast.success("Passkey hinzugefügt");
      onChanged();
    } catch {
      toast.error("Passkey-Registrierung abgebrochen oder fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  async function renamePasskey(id: string, name: string) {
    if (!name.trim()) return;
    const res = await fetch(`/api/account/webauthn/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      toast.error("Umbenennen fehlgeschlagen");
      return;
    }
    onChanged();
  }

  async function removePasskey(id: string) {
    const message =
      passkeys.length === 1
        ? "Letzten Passkey wirklich entfernen? Danach ist wieder Passwort-Login für diesen Account möglich."
        : "Passkey wirklich entfernen? Andere aktive Sessions werden beendet.";
    if (
      !(await confirm({
        title: "Passkey entfernen",
        description: message,
        confirmText: "Entfernen",
        variant: "destructive",
      }))
    )
      return;
    const res = await fetch(`/api/account/webauthn/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Entfernen fehlgeschlagen");
      return;
    }
    toast.success("Passkey entfernt");
    onChanged();
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Passkeys</CardTitle>
        {!ipHost && (
          <Button size="sm" disabled={loading} onClick={addPasskey}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Fingerprint className="size-4" />}
            Passkey hinzufügen
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {ipHost && (
          <p className="text-sm text-muted-foreground">
            Passkeys benötigen eine feste Domain – über eine IP-Adresse aufgerufen werden sie
            von Browsern nicht unterstützt.
          </p>
        )}
        {passkeys.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Solange mindestens ein Passkey hinterlegt ist, sind Passwort-Login und 2FA für diesen
            Account gesperrt.
          </p>
        )}
        <PasskeyList passkeys={passkeys} onRename={renamePasskey} onRemove={removePasskey} />
      </CardContent>
    </Card>
  );
}
