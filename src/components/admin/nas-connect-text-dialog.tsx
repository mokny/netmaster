"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy } from "lucide-react";
import { buildConnectionText, type NasGatewayPublicSettings } from "@/lib/nas-connect-text";

export function NasConnectTextDialog({
  open,
  onOpenChange,
  nasUser,
  password,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nasUser: { email: string; name: string };
  // Nur direkt nach einer Passwortvergabe im Klartext bekannt - sonst
  // Platzhalter im Text (siehe buildConnectionText).
  password?: string;
}) {
  const t = useTranslations("nasConnectText");
  const [settings, setSettings] = useState<NasGatewayPublicSettings | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/admin/nas/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data?.settings && setSettings(data.settings));
  }, [open]);

  const text = settings
    ? buildConnectionText({
        nasUser,
        settings,
        webUrl: typeof window !== "undefined" ? `${window.location.origin}/nas` : "/nas",
        password,
        t,
      })
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title", { name: nasUser.name })}</DialogTitle>
        </DialogHeader>
        {password && <p className="text-xs text-amber-500">{t("passwordShownOnceHint")}</p>}
        <Textarea readOnly rows={16} value={text} className="font-mono text-xs" />
        <DialogFooter>
          <Button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(text);
              toast.success(t("copied"));
            }}
          >
            <Copy className="size-4" />
            {t("copy")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
