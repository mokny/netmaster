"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("account.passkeyCard");
  const tErrors = useTranslations("errors");
  const [loading, setLoading] = useState(false);
  const ipHost = isIpHost();

  async function addPasskey() {
    const name = await prompt({
      title: t("addTitle"),
      label: t("nameLabel"),
      placeholder: t("namePlaceholder"),
      defaultValue: t("defaultName"),
      confirmText: t("continue"),
    });
    if (name === null) return;

    setLoading(true);
    try {
      const optionsRes = await fetch("/api/account/webauthn/register/options", {
        method: "POST",
      });
      const options = await optionsRes.json();
      if (!optionsRes.ok) {
        toast.error(tErrors(options.error ?? "PASSKEY_SETUP_UNAVAILABLE"));
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
        toast.error(tErrors(data.error ?? "PASSKEY_CREATE_FAILED"));
        return;
      }
      toast.success(t("added"));
      onChanged();
    } catch {
      toast.error(t("registrationAborted"));
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
      toast.error(t("renameFailed"));
      return;
    }
    onChanged();
  }

  async function removePasskey(id: string) {
    const message = passkeys.length === 1 ? t("removeLastMessage") : t("removeMessage");
    if (
      !(await confirm({
        title: t("removeTitle"),
        description: message,
        confirmText: t("remove"),
        variant: "destructive",
      }))
    )
      return;
    const res = await fetch(`/api/account/webauthn/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(t("removeFailed"));
      return;
    }
    toast.success(t("removed"));
    onChanged();
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        {!ipHost && (
          <Button size="sm" disabled={loading} onClick={addPasskey}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Fingerprint className="size-4" />}
            {t("addButton")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {ipHost && <p className="text-sm text-muted-foreground">{t("ipHostWarning")}</p>}
        {passkeys.length > 0 && (
          <p className="text-sm text-muted-foreground">{t("lockedNotice")}</p>
        )}
        <PasskeyList passkeys={passkeys} onRename={renamePasskey} onRemove={removePasskey} />
      </CardContent>
    </Card>
  );
}
