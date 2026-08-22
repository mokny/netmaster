"use client";

import { useEffect, useState } from "react";
import { useLiveEvents } from "./use-live-events";

// Prüft global (instanzweit), ob eine Client-seitige Polling-Art gerade aktiv
// sein soll (siehe Admin > Einstellungen > Polling). Holt den Anfangszustand
// per Fetch und hält ihn danach live über den WS-Broadcast aktuell, damit ein
// Admin-Umschalten ohne Reload wirkt. Bis zur ersten Antwort wird `true`
// angenommen (Standardverhalten, kein Verzögerungs-Flackern).
export function usePollingEnabled(key: string): boolean {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/polling-settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.settings && key in data.settings) {
          setEnabled(Boolean(data.settings[key]));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [key]);

  useLiveEvents((event) => {
    if (event.type === "polling-settings" && key in event.settings) {
      setEnabled(Boolean(event.settings[key]));
    }
  });

  return enabled;
}
