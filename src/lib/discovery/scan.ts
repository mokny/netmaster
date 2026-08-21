import { prisma } from "@/lib/prisma";
import { detectLocalRanges, ipInCidr } from "./range";
import { detectGatewayForInterface, readSystemDnsServers } from "./gateway";
import { DEFAULT_SCAN_PORTS, resolveNetbiosName, runHostDiscovery, runPortScan } from "./nmap";
import type { ExploreRange } from "@/generated/prisma/client";

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

// Synchronisiert die LAN_AUTO/VPN_AUTO-Zeilen in ExploreRange mit den
// aktuell am lokalen Host vorhandenen Netzwerk-Interfaces. Wird vom
// Monitor-Scheduler alle 15s aufgerufen (reconcile-Loop). Das `enabled`-Flag
// ist ein reiner User-Override und wird hier nie verändert - nur das
// Erscheinen/Verschwinden eines Interfaces steuert Erstellen/Löschen einer
// Auto-Range.
export async function reconcileRanges(): Promise<void> {
  const detected = detectLocalRanges();
  const existing = await prisma.exploreRange.findMany({
    where: { source: { in: ["LAN_AUTO", "VPN_AUTO"] } },
  });

  const detectedByInterface = new Map(detected.map((d) => [d.interfaceName, d]));

  for (const range of existing) {
    const stillPresent = range.interfaceName && detectedByInterface.get(range.interfaceName);
    if (!stillPresent) {
      await prisma.exploreRange.delete({ where: { id: range.id } });
      continue;
    }
    if (stillPresent.cidr !== range.cidr || stillPresent.source !== range.source) {
      await prisma.exploreRange.update({
        where: { id: range.id },
        data: { cidr: stillPresent.cidr, source: stillPresent.source },
      });
    }
    detectedByInterface.delete(range.interfaceName as string);
  }

  for (const d of detectedByInterface.values()) {
    await prisma.exploreRange.create({
      data: { cidr: d.cidr, source: d.source, interfaceName: d.interfaceName, enabled: true },
    });
  }
}

async function resolveEnabledRanges(): Promise<ExploreRange[]> {
  const ranges = await prisma.exploreRange.findMany({ where: { enabled: true } });
  if (ranges.length === 0) {
    throw new Error(
      "Keine aktive Scan-Range vorhanden - bitte in den Explore-Einstellungen eine Range hinzufügen/aktivieren"
    );
  }
  return ranges;
}

function findRangeForIp(ip: string, ranges: ExploreRange[]): ExploreRange | undefined {
  return ranges.find((r) => ipInCidr(ip, r.cidr));
}

// Ermittelt zusätzliche Reverse-DNS-Server für den Scan: die Gateways der
// LAN-Ranges (die als Router meist die DHCP-Hostnamen kennen) plus die
// ohnehin konfigurierten System-Nameserver. Wird an nmap --dns-servers
// übergeben, damit lokale Hostnamen auch dann aufgelöst werden, wenn der
// System-Resolver primär einen anderen Server (z.B. Pi-hole/AdGuard)
// anspricht, der keine lokalen PTR-Einträge kennt.
async function resolveDnsServers(ranges: ExploreRange[]): Promise<string[]> {
  const lanInterfaces = ranges
    .filter((r) => r.source === "LAN_AUTO" && r.interfaceName)
    .map((r) => r.interfaceName as string);

  const gateways = await Promise.all(lanInterfaces.map(detectGatewayForInterface));
  const servers = [...readSystemDnsServers(), ...gateways.filter((g): g is string => g !== null)];
  return Array.from(new Set(servers));
}

// Führt async-Aufgaben mit begrenzter Konkurrenz aus (einfacher Worker-Pool),
// damit nicht beliebig viele nmap-Prozesse gleichzeitig gestartet werden.
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker);
  await Promise.all(workers);
  return results;
}

// Führt einen vollständigen Discovery-Scan durch: Host-Sweep über alle
// aktivierten Ranges (ein kombinierter nmap-Lauf), dann parallelisierter
// Port-/Service-Scan pro gefundenem Host, dann Upsert aller Ergebnisse in
// DiscoveredHost. Läuft bereits ein Scan, wird kein zweiter gestartet.
export async function runDiscoveryScan(): Promise<void> {
  if (state.status === "running") return;

  state.status = "running";
  state.startedAt = new Date().toISOString();
  state.error = null;
  state.progress = { phase: "hosts", current: 0, total: 0 };

  try {
    const [ranges, settings] = await Promise.all([
      resolveEnabledRanges(),
      getOrCreateExploreSettings(),
    ]);
    const dnsServers = await resolveDnsServers(ranges);
    const hosts = await runHostDiscovery(
      ranges.map((r) => r.cidr),
      120_000,
      dnsServers
    );
    const withMac = hosts.filter((h) => h.mac);

    state.progress = { phase: "ports", current: 0, total: withMac.length };

    const touchedMacs: string[] = [];
    let completed = 0;

    await mapWithConcurrency(withMac, settings.portScanConcurrency, async (host) => {
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
      const hostname = host.hostname || (await resolveNetbiosName(host.ip));
      const range = findRangeForIp(host.ip, ranges);
      await prisma.discoveredHost.upsert({
        where: { mac },
        create: {
          ip: host.ip,
          mac,
          hostname,
          vendor: host.vendor,
          openPortsJson: JSON.stringify(openPorts),
          lastSeenOnline: true,
          firstSeenAt: now,
          lastSeenAt: now,
          rangeId: range?.id,
        },
        update: {
          ip: host.ip,
          hostname,
          vendor: host.vendor,
          openPortsJson: JSON.stringify(openPorts),
          lastSeenOnline: true,
          lastSeenAt: now,
          rangeId: range?.id ?? null,
        },
      });

      completed += 1;
      state.progress = { phase: "ports", current: completed, total: withMac.length };
    });

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
