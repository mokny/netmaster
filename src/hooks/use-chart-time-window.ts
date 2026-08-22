"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export const MIN_WINDOW_MS = 5 * 60 * 1000;
export const MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const LIVE_REFRESH_MS = 30_000;

export interface ChartTimeWindow {
  from: number;
  to: number;
  windowMs: number;
  isLive: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
  goLive: () => void;
  panBy: (deltaMs: number) => void;
}

// Geteilter Zeitfenster-Zustand für alle Zeitreihen-Charts (siehe
// ChartTimeToolbar/ChartPanOverlay). Startet immer live bei der letzten
// Stunde; sobald gezoomt oder gepannt wird, friert die Ansicht bei einem
// festen "to" ein (kein Auto-Refresh mehr), bis goLive() wieder aufgerufen
// wird. Nichts davon wird persistiert - ein Reload startet immer neu live.
export function useChartTimeWindow(options?: { maxWindowMs?: number }): ChartTimeWindow {
  const maxWindowMs = options?.maxWindowMs ?? MAX_WINDOW_MS;
  const [windowMs, setWindowMs] = useState(DEFAULT_WINDOW_MS);
  // null = live (to folgt "jetzt"), sonst eingefroren auf diesen Zeitpunkt.
  const [anchorTo, setAnchorTo] = useState<number | null>(null);
  // "Jetzt" darf nicht direkt im Render über Date.now() gelesen werden (nicht
  // pure) - stattdessen als State geführt (Lazy-Initializer läuft nur einmal
  // beim Mount), das der Live-Timer alle 30s per Subscription sowie goLive()
  // sofort per Event-Handler aktualisieren.
  const [liveNow, setLiveNow] = useState(() => Date.now());

  const isLive = anchorTo === null;

  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => setLiveNow(Date.now()), LIVE_REFRESH_MS);
    return () => clearInterval(id);
  }, [isLive]);

  // windowMs kann größer sein als maxWindowMs, wenn maxWindowMs sich (z.B.
  // Debug-Seite mit 2-Tage-Deckel) nach einem Zoom-Out verringert hätte -
  // hier zusätzlich abgesichert.
  const effectiveWindowMs = Math.min(windowMs, maxWindowMs);

  const to = isLive ? liveNow : anchorTo;
  const from = to - effectiveWindowMs;

  const freezeIfLive = useCallback(() => {
    setAnchorTo((prev) => prev ?? Date.now());
  }, []);

  const zoomIn = useCallback(() => {
    freezeIfLive();
    setWindowMs((w) => Math.max(MIN_WINDOW_MS, w / 2));
  }, [freezeIfLive]);

  const zoomOut = useCallback(() => {
    freezeIfLive();
    setWindowMs((w) => Math.min(maxWindowMs, w * 2));
  }, [freezeIfLive, maxWindowMs]);

  const goLive = useCallback(() => {
    setLiveNow(Date.now());
    setAnchorTo(null);
    setWindowMs(DEFAULT_WINDOW_MS);
  }, []);

  const panBy = useCallback(
    (deltaMs: number) => {
      setAnchorTo((prevAnchor) => {
        const currentTo = prevAnchor ?? Date.now();
        const now = Date.now();
        const lowerTo = now - maxWindowMs + effectiveWindowMs;
        const nextTo = Math.min(now, Math.max(lowerTo, currentTo + deltaMs));
        return nextTo;
      });
    },
    [maxWindowMs, effectiveWindowMs]
  );

  return useMemo(
    () => ({
      from,
      to,
      windowMs: effectiveWindowMs,
      isLive,
      zoomIn,
      zoomOut,
      canZoomIn: effectiveWindowMs > MIN_WINDOW_MS,
      canZoomOut: effectiveWindowMs < maxWindowMs,
      goLive,
      panBy,
    }),
    [from, to, effectiveWindowMs, isLive, zoomIn, zoomOut, maxWindowMs, goLive, panBy]
  );
}

export function formatWindowLabel(windowMs: number): string {
  const minutes = windowMs / 60_000;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours % 1 === 0 ? hours : hours.toFixed(1)}h`;
  const days = hours / 24;
  return `${days % 1 === 0 ? days : days.toFixed(1)}d`;
}
