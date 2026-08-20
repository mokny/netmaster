"use client";

import { useEffect, useRef } from "react";
import { NO_SLEEP_MP4, NO_SLEEP_WEBM } from "@/lib/no-sleep-media";
import {
  WAKE_LOCK_CHANGE_EVENT,
  getWakeLockPreference,
  shouldUseVideoFallback,
} from "@/lib/wake-lock";

// Hält den Bildschirm app-weit wach, solange die Einstellung aktiv ist.
// Wird einmal dauerhaft im AppShell gemountet, damit der Effekt beim
// Navigieren zwischen Seiten nicht abbricht.
export function WakeLockManager() {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    function onLoadedMetadata() {
      if (!video) return;
      if (video.duration <= 1) {
        video.loop = true;
      } else {
        video.addEventListener("timeupdate", () => {
          if (video.currentTime > 0.5) video.currentTime = Math.random();
        });
      }
    }
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    return () => video.removeEventListener("loadedmetadata", onLoadedMetadata);
  }, []);

  useEffect(() => {
    async function acquire() {
      if (shouldUseVideoFallback()) {
        try {
          await videoRef.current?.play();
        } catch {
          // Wiedergabe ohne Nutzerinteraktion evtl. blockiert; wird beim
          // nächsten sichtbaren Zustand erneut versucht.
        }
        return;
      }
      try {
        sentinelRef.current = await navigator.wakeLock.request("screen");
      } catch {
        // Wird meist durch Tab-Wechsel/Minimieren verhindert.
      }
    }

    function release() {
      sentinelRef.current?.release().catch(() => {});
      sentinelRef.current = null;
      videoRef.current?.pause();
    }

    function sync() {
      if (getWakeLockPreference()) acquire();
      else release();
    }

    sync();

    function onVisibilityChange() {
      if (document.visibilityState === "visible") sync();
    }

    window.addEventListener(WAKE_LOCK_CHANGE_EVENT, sync);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener(WAKE_LOCK_CHANGE_EVENT, sync);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      release();
    };
  }, []);

  return (
    <video
      ref={videoRef}
      muted
      playsInline
      loop
      className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
      aria-hidden
      tabIndex={-1}
    >
      <source src={NO_SLEEP_WEBM} type="video/webm" />
      <source src={NO_SLEEP_MP4} type="video/mp4" />
    </video>
  );
}
