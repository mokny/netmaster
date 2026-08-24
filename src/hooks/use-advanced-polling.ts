"use client";

import { useEffect, useState } from "react";
import { useLiveEvents } from "./use-live-events";

const KEY = "advancedPollingEnabled";

// Wie usePollingEnabled, aber zusätzlich mit einem toggle() zum Umschalten
// (PATCH /api/polling-settings) - nur für Admins gedacht (siehe
// AdvancedPollingToggle), die Route selbst erzwingt requireRole("ADMIN").
export function useAdvancedPolling(): { enabled: boolean; pending: boolean; toggle: () => Promise<void> } {
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/polling-settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.settings && KEY in data.settings) {
          setEnabled(Boolean(data.settings[KEY]));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useLiveEvents((event) => {
    if (event.type === "polling-settings" && KEY in event.settings) {
      setEnabled(Boolean(event.settings[KEY]));
    }
  });

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    setPending(true);
    try {
      const res = await fetch("/api/polling-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [KEY]: next }),
      });
      if (!res.ok) setEnabled(!next);
    } catch {
      setEnabled(!next);
    } finally {
      setPending(false);
    }
  }

  return { enabled, pending, toggle };
}
