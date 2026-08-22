import { prisma } from "@/lib/prisma";
import type { PollingSettings } from "@/generated/prisma/client";

export async function getOrCreatePollingSettings(): Promise<PollingSettings> {
  const existing = await prisma.pollingSettings.findFirst();
  if (existing) return existing;
  return prisma.pollingSettings.create({ data: {} });
}

// In-Memory-Cache für die häufigen, latenzkritischen Lesezugriffe (Scheduler-
// Reconcile alle 15s, WS-Prozessliste alle 2.5s) - vermeidet einen DB-Roundtrip
// pro Tick. Wird beim Start und nach jedem PATCH aktualisiert, sonst spätestens
// beim nächsten Reconcile-Tick (siehe scheduler.ts).
let cached: PollingSettings | null = null;

export function getCachedPollingSettings(): PollingSettings | null {
  return cached;
}

export async function refreshPollingSettingsCache(): Promise<PollingSettings> {
  cached = await getOrCreatePollingSettings();
  return cached;
}
