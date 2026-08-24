"use client";

import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { useAdvancedPolling } from "@/hooks/use-advanced-polling";

// Nur für Admins gerendert (siehe app-shell.tsx) - schaltet PollingSettings.
// advancedPollingEnabled global für alle Clients um. Wird serverseitig
// automatisch wieder deaktiviert, sobald niemand mehr per WebSocket verbunden
// ist (siehe server.ts, onLastClientDisconnected).
export function AdvancedPollingToggle() {
  const t = useTranslations("shell");
  const { enabled, pending, toggle } = useAdvancedPolling();

  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
      <Checkbox
        checked={enabled}
        disabled={pending}
        onCheckedChange={() => void toggle()}
      />
      {t("advancedPolling")}
    </label>
  );
}
