"use client";

import { useCallback, useState } from "react";

const STORAGE_PREFIX = "netmaster:tool-history:";
const MAX_ENTRIES = 10;

function readHistory(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function useToolHistory(key: string) {
  const [history, setHistory] = useState<string[]>(() => readHistory(key));

  const addEntry = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      const next = [trimmed, ...readHistory(key).filter((v) => v !== trimmed)].slice(0, MAX_ENTRIES);
      try {
        window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(next));
      } catch {
        // storage unavailable or quota exceeded; history is a convenience feature, safe to skip
      }
      setHistory(next);
    },
    [key]
  );

  return { history, addEntry };
}
