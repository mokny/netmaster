export const WAKE_LOCK_STORAGE_KEY = "keep_screen_awake";
export const WAKE_LOCK_CHANGE_EVENT = "wake-lock-preference-change";

export function isIOS() {
  return (
    typeof navigator !== "undefined" &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      // iPadOS 13+ meldet sich als Mac, hat aber Touch-Unterstützung
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1))
  );
}

export function isStandalonePWA() {
  return (
    typeof navigator !== "undefined" &&
    // @ts-expect-error Safari-only, nicht in lib.dom-Typen enthalten
    navigator.standalone === true
  );
}

// Auf iOS meldet eine installierte PWA zwar "wakeLock" in navigator, hält den
// Bildschirm im Standalone-Modus damit aber oft nicht wirklich wach (bekannter
// WebKit-Bug). Dort daher immer den stillen Video-Loop-Trick nutzen.
export function shouldUseVideoFallback() {
  if (isIOS() && isStandalonePWA()) return true;
  return typeof navigator === "undefined" || !("wakeLock" in navigator);
}

export function wakeLockAvailable() {
  return shouldUseVideoFallback() || (typeof navigator !== "undefined" && "wakeLock" in navigator);
}

export function getWakeLockPreference() {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(WAKE_LOCK_STORAGE_KEY) === "1";
}

export function setWakeLockPreference(enabled: boolean) {
  localStorage.setItem(WAKE_LOCK_STORAGE_KEY, enabled ? "1" : "0");
  window.dispatchEvent(new CustomEvent(WAKE_LOCK_CHANGE_EVENT, { detail: enabled }));
}
