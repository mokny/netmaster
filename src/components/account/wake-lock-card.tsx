"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getWakeLockPreference, setWakeLockPreference, wakeLockAvailable } from "@/lib/wake-lock";

export function WakeLockCard() {
  const t = useTranslations("account.wakeLock");
  const [enabled, setEnabled] = useState(() => getWakeLockPreference());
  const [supported] = useState(() => wakeLockAvailable());

  function toggle(next: boolean) {
    setEnabled(next);
    setWakeLockPreference(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="wake-lock" className="font-normal">
            {t("keepScreenOn")}
          </Label>
          <Switch id="wake-lock" checked={enabled} onCheckedChange={toggle} disabled={!supported} />
        </div>
        {!supported && <p className="mt-2 text-xs text-muted-foreground">{t("unsupported")}</p>}
      </CardContent>
    </Card>
  );
}
