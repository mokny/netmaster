"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const STORAGE_KEY = "keep_screen_awake";

function wakeLockSupported() {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

export function WakeLockCard() {
  const [enabled, setEnabled] = useState(false);
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  async function requestLock() {
    if (!wakeLockSupported()) return;
    try {
      sentinelRef.current = await navigator.wakeLock.request("screen");
    } catch {
      // Wird meist durch Tab-Wechsel/Minimieren verhindert, kein Fehler des Nutzers.
    }
  }

  function releaseLock() {
    sentinelRef.current?.release().catch(() => {});
    sentinelRef.current = null;
  }

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) === "1";
    setEnabled(stored);
    if (stored) requestLock();

    function onVisibilityChange() {
      if (document.visibilityState === "visible" && localStorage.getItem(STORAGE_KEY) === "1") {
        requestLock();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      releaseLock();
    };
  }, []);

  async function toggle(next: boolean) {
    if (next && !wakeLockSupported()) {
      toast.error("Dieser Browser unterstützt kein permanentes Wachhalten des Bildschirms");
      return;
    }
    setEnabled(next);
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    if (next) {
      await requestLock();
      if (!sentinelRef.current) {
        toast.error("Bildschirm konnte nicht wachgehalten werden");
      }
    } else {
      releaseLock();
    }
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
          <Switch id="wake-lock" checked={enabled} onCheckedChange={toggle} />
        </div>
      </CardContent>
    </Card>
  );
}
