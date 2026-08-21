import { execFile } from "node:child_process";
import { XMLParser } from "fast-xml-parser";

export interface DiscoveredAddress {
  ip: string;
  mac?: string;
  vendor?: string;
  hostname?: string;
}

export interface DiscoveredPort {
  port: number;
  service: string;
  version: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => name === "host" || name === "address" || name === "hostname" || name === "port",
});

function ensureArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function runNmap(args: string[], timeoutMs: number, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "nmap",
      args,
      { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, signal },
      (err, stdout) => {
        if (err) {
          reject(new Error(`nmap fehlgeschlagen (${args.join(" ")}): ${err.message}`));
          return;
        }
        resolve(stdout);
      }
    );
    child.on("error", (err) => reject(err));
  });
}

// nmap -sn: reiner Host-Discovery-Sweep (ARP im lokalen Subnetz, ICMP sonst),
// kein Port-Scan. MAC/Vendor sind nur verfügbar, wenn nmap mit ausreichenden
// Rechten läuft (NET_RAW/NET_ADMIN) und der Host per ARP erreichbar ist.
// Host-Discovery-Probes: explizit statt nmap-Default (ICMP-Echo + TCP-SYN/443
// + TCP-ACK/80), weil viele VPN-Gegenstellen (z.B. ein schlanker WireGuard-
// Testserver) nur SSH offen haben und ICMP blocken - mit den Default-Probes
// würde so ein durchaus erreichbarer Host fälschlich als "down" gelten und
// gar nicht erst im Sweep-Ergebnis auftauchen. Für Ethernet-Ziele im
// gleichen L2-Segment macht nmap unabhängig davon zusätzlich immer noch
// automatisch einen ARP-Scan (liefert dort die MAC-Adresse).
const HOST_DISCOVERY_PROBES = ["-PE", "-PP", "-PS22,80,443", "-PA22,80,443"];

// `ranges` kann mehrere CIDR-Targets enthalten - nmap scannt sie in einem
// einzigen Lauf. `dnsServers` überschreibt, welche Nameserver nmap für die
// Reverse-DNS-Auflösung (Hostnamen) befragt - z.B. das Gateway/Router-DNS
// einer Range, damit auch lokale DHCP-Hostnamen aufgelöst werden, selbst
// wenn der System-Resolver einen anderen Server priorisiert.
export async function runHostDiscovery(
  ranges: string | string[],
  timeoutMs = 120_000,
  dnsServers?: string[],
  signal?: AbortSignal
): Promise<DiscoveredAddress[]> {
  const targets = Array.isArray(ranges) ? ranges : [ranges];
  const dnsArgs = dnsServers && dnsServers.length > 0 ? ["--dns-servers", dnsServers.join(",")] : [];
  const xml = await runNmap(
    ["-sn", ...HOST_DISCOVERY_PROBES, ...dnsArgs, "-oX", "-", ...targets],
    timeoutMs,
    signal
  );
  const parsed = parser.parse(xml);
  const hosts = ensureArray(parsed?.nmaprun?.host);

  const results: DiscoveredAddress[] = [];
  for (const host of hosts) {
    if (host?.status?.["@_state"] !== "up") continue;
    const addresses = ensureArray(host.address);
    const ipv4 = addresses.find((a: Record<string, string>) => a["@_addrtype"] === "ipv4");
    const macEntry = addresses.find((a: Record<string, string>) => a["@_addrtype"] === "mac");
    if (!ipv4) continue;
    const hostnameEntries = ensureArray(host.hostnames?.hostname);
    const hostname = hostnameEntries.find((h: Record<string, string>) => h["@_name"])?.[
      "@_name"
    ];
    results.push({
      ip: ipv4["@_addr"],
      mac: macEntry?.["@_addr"],
      vendor: macEntry?.["@_vendor"] || undefined,
      hostname: hostname || undefined,
    });
  }
  return results;
}

// Fallback für Hosts ohne PTR-Eintrag (die meisten Consumer-Geräte ohne
// eigenen DNS-Eintrag im Netz): fragt den NetBIOS-Namen per UDP/137 ab.
// Erfasst v.a. Windows- und Samba-Hosts. Erfordert root/NET_RAW (wie der
// restliche Discovery-Scan) - schlägt der Scan fehl oder liefert nichts,
// wird das als "kein Name ermittelbar" behandelt statt den Sweep abzubrechen.
export async function resolveNetbiosName(
  ip: string,
  timeoutMs = 10_000,
  signal?: AbortSignal
): Promise<string | undefined> {
  try {
    const xml = await runNmap(
      ["-sU", "-p", "137", "--host-timeout", "5s", "--script", "nbstat", "-oX", "-", ip],
      timeoutMs,
      signal
    );
    const parsed = parser.parse(xml);
    const hosts = ensureArray(parsed?.nmaprun?.host);
    const host = hosts[0];
    const scripts = ensureArray(host?.hostscript?.script);
    const nbstat = scripts.find((s: Record<string, string>) => s["@_id"] === "nbstat");
    const output: string = nbstat?.["@_output"] ?? "";
    const match = output.match(/NetBIOS name:\s*([^\s,]+)/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

// nmap -sV: Port-/Dienst-/Versionserkennung für einen einzelnen bereits
// bekannten Host. Nur offene Ports werden zurückgegeben.
export async function runPortScan(
  ip: string,
  ports: string,
  timeoutMs = 60_000,
  signal?: AbortSignal
): Promise<DiscoveredPort[]> {
  const xml = await runNmap(["-sV", "-p", ports, "-oX", "-", ip], timeoutMs, signal);
  const parsed = parser.parse(xml);
  const hosts = ensureArray(parsed?.nmaprun?.host);
  const host = hosts[0];
  if (!host) return [];

  const ports_ = ensureArray(host.ports?.port);
  const results: DiscoveredPort[] = [];
  for (const port of ports_) {
    if (port?.state?.["@_state"] !== "open") continue;
    const service = port.service ?? {};
    const name = service["@_name"] ?? "";
    const product = service["@_product"] ?? "";
    const version = service["@_version"] ?? "";
    results.push({
      port: Number(port["@_portid"]),
      service: name,
      version: [product, version].filter(Boolean).join(" "),
    });
  }
  return results;
}

// Osguess wird bewusst nicht implementiert (kein -O-Scan, siehe Plan) - v1
// beschränkt sich auf Host-Discovery + Port-/Service-Erkennung.

export const DEFAULT_SCAN_PORTS =
  "21,22,23,25,53,80,110,139,143,443,445,3306,3389,5432,5900,6379,8080,8443,27017";
