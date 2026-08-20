"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getWakeLockPreference, setWakeLockPreference, wakeLockAvailable } from "@/lib/wake-lock";

export function WakeLockCard() {
  const [enabled, setEnabled] = useState(() => getWakeLockPreference());
  const [supported] = useState(() => wakeLockAvailable());

  function toggle(next: boolean) {
    setEnabled(next);
    setWakeLockPreference(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Anzeige</CardTitle>
        <CardDescription>
          Verhindert, dass sich der Bildschirm ausschaltet, solange die App geöffnet ist.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="wake-lock" className="font-normal">
            Bildschirm nicht ausschalten
          </Label>
          <Switch id="wake-lock" checked={enabled} onCheckedChange={toggle} disabled={!supported} />
        </div>
        {!supported && (
          <p className="mt-2 text-xs text-muted-foreground">
            Dein Browser unterstützt diese Funktion nicht.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
