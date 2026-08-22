"use client";

import { useEffect, useState } from "react";

// Verzögert Werteänderungen um delayMs - genutzt, um Metrik-Refetches während
// eines Chart-Drags (siehe ChartPanOverlay, feuert pro Pixel) zu bündeln
// statt bei jeder Zwischenposition einen eigenen Request zu schicken.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
