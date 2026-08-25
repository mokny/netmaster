"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Copy } from "lucide-react";
import { buildConnectionText, type NasGatewayPublicSettings } from "@/lib/nas-connect-text";

export function NasConnectionInfoCard({
  nasUser,
  password,
}: {
  nasUser: { email: string; name: string };
  // Nur direkt nach einem eigenen Passwortwechsel im Klartext bekannt.
  password?: string;
}) {
  const t = useTranslations("nasConnectText");
  const [settings, setSettings] = useState<NasGatewayPublicSettings | null>(null);

  useEffect(() => {
    fetch("/api/nas/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data?.settings && setSettings(data.settings));
  }, []);

  if (!settings) return null;

  const text = buildConnectionText({
    nasUser,
    settings,
    webUrl: typeof window !== "undefined" ? `${window.location.origin}/nas` : "/nas",
    password,
    t,
  });

  return (
    <Card className="max-w-md space-y-3 p-4">
      <div>
        <h2 className="text-sm font-medium">{t("cardTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("cardHint")}</p>
      </div>
      {password && <p className="text-xs text-amber-500">{t("passwordShownOnceHint")}</p>}
      <Textarea readOnly rows={14} value={text} className="font-mono text-xs" />
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          toast.success(t("copied"));
        }}
      >
        <Copy className="size-4" />
        {t("copy")}
      </Button>
    </Card>
  );
}
