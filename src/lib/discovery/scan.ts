import { prisma } from "@/lib/prisma";
import { detectDefaultRange } from "./range";
import { DEFAULT_SCAN_PORTS, runHostDiscovery, runPortScan } from "./nmap";

export type ScanStatus = "idle" | "running" | "error";

export interface ScanProgress {
  phase: "hosts" | "ports";
  current: number;
  total: number;
}

interface ScanState {
  status: ScanStatus;
  startedAt: string | null;
  progress: ScanProgress | null;
  error: string | null;
  lastCompletedAt: string | null;
}

const state: ScanState = {
  status: "idle",
  startedAt: null,
  progress: null,
  error: null,
  lastCompletedAt: null,
};

export function getScanStatus(): ScanState {
  return { ...state };
}

export async function getOrCreateExploreSettings() {
  const existing = await prisma.exploreSettings.findFirst();
  if (existing) return existing;
  return prisma.exploreSettings.create({ data: {} });
}

async function resolveScanRange(): Promise<string> {
  const settings = await getOrCreateExploreSettings();
  if (settings.scanRangeOverride) return settings.scanRangeOverride;
  const detected = detectDefaultRange();
  if (!detected) {
    throw new Error(
      "Konnte keine Netzwerk-Schnittstelle für den Scan ermitteln - bitte Scan-Range manuell in den Einstellungen setzen"
    );
  }
  return detected;
}

// Führt einen vollständigen Discovery-Scan durch: Host-Sweep, dann pro
// gefundenem Host ein Port-/Service-Scan, dann Upsert aller Ergebnisse in
// DiscoveredHost. Läuft bereits ein Scan, wird kein zweiter gestartet.
export async function runDiscoveryScan(): Promise<void> {
  if (state.status === "running") return;

  state.status = "running";
  state.startedAt = new Date().toISOString();
  state.error = null;
  state.progress = { phase: "hosts", current: 0, total: 0 };

  try {
    const range = await resolveScanRange();
    const hosts = await runHostDiscovery(range);
    const withMac = hosts.filter((h) => h.mac);

    state.progress = { phase: "ports", current: 0, total: withMac.length };

    const touchedMacs: string[] = [];
    for (const host of withMac) {
      let openPorts: Awaited<ReturnType<typeof runPortScan>> = [];
      try {
        openPorts = await runPortScan(host.ip, DEFAULT_SCAN_PORTS);
      } catch {
        // Port-Scan-Fehler für einen einzelnen Host sollen den restlichen
        // Sweep nicht abbrechen - der Host bleibt mit leeren Ports sichtbar.
      }

      const mac = host.mac!;
      touchedMacs.push(mac);
      const now = new Date();
      await prisma.discoveredHost.upsert({
        where: { mac },
        create: {
          ip: host.ip,
          mac,
          vendor: host.vendor,
          openPortsJson: JSON.stringify(openPorts),
          lastSeenOnline: true,
          firstSeenAt: now,
          lastSeenAt: now,
        },
        update: {
          ip: host.ip,
          vendor: host.vendor,
          openPortsJson: JSON.stringify(openPorts),
          lastSeenOnline: true,
          lastSeenAt: now,
        },
      });

      state.progress = {
        phase: "ports",
        current: state.progress.current + 1,
        total: withMac.length,
      };
    }

    if (touchedMacs.length > 0) {
      await prisma.discoveredHost.updateMany({
        where: { mac: { notIn: touchedMacs } },
        data: { lastSeenOnline: false },
      });
    }

    state.lastCompletedAt = new Date().toISOString();
  } catch (err) {
    state.status = "error";
    state.error = err instanceof Error ? err.message : "Unbekannter Fehler beim Scan";
    return;
  } finally {
    if (state.status !== "error") state.status = "idle";
  }
}
