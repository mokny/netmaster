import { execFile } from "node:child_process";
import { XMLParser } from "fast-xml-parser";

export interface DiscoveredAddress {
  ip: string;
  mac?: string;
  vendor?: string;
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

function runNmap(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "nmap",
      args,
      { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 },
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
export async function runHostDiscovery(
  range: string,
  timeoutMs = 120_000
): Promise<DiscoveredAddress[]> {
  const xml = await runNmap(["-sn", "-oX", "-", range], timeoutMs);
  const parsed = parser.parse(xml);
  const hosts = ensureArray(parsed?.nmaprun?.host);

  const results: DiscoveredAddress[] = [];
  for (const host of hosts) {
    if (host?.status?.["@_state"] !== "up") continue;
    const addresses = ensureArray(host.address);
    const ipv4 = addresses.find((a: Record<string, string>) => a["@_addrtype"] === "ipv4");
    const macEntry = addresses.find((a: Record<string, string>) => a["@_addrtype"] === "mac");
    if (!ipv4) continue;
    results.push({
      ip: ipv4["@_addr"],
      mac: macEntry?.["@_addr"],
      vendor: macEntry?.["@_vendor"] || undefined,
    });
  }
  return results;
}

// nmap -sV: Port-/Dienst-/Versionserkennung für einen einzelnen bereits
// bekannten Host. Nur offene Ports werden zurückgegeben.
export async function runPortScan(
  ip: string,
  ports: string,
  timeoutMs = 60_000
): Promise<DiscoveredPort[]> {
  const xml = await runNmap(["-sV", "-p", ports, "-oX", "-", ip], timeoutMs);
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
