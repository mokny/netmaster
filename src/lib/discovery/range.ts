import os from "node:os";

export type AutoRangeSource = "LAN_AUTO" | "VPN_AUTO";

export interface DetectedRange {
  cidr: string;
  source: AutoRangeSource;
  interfaceName: string;
}

// Interface-Namenspräfixe, die als VPN gelten (WireGuard, generisches
// TUN/TAP, PPP-Tunnel). Alles andere nicht-interne IPv4-Interface gilt als
// normales LAN-Interface.
const VPN_PREFIXES = ["wg", "tun", "tap", "ppp"];

// Virtuelle Bridge-/Container-Interfaces, die kein reales Netzwerk sind und
// daher nie als Scan-Range erkannt werden sollen - z.B. Dockers docker0
// (172.17.0.0/16, ein /16!), Compose-Bridges (br-*), veth-Paare einzelner
// Container, CNI/Podman/Calico/libvirt-Bridges. Da netmaster im Docker-Host-
// Networking läuft, sieht os.networkInterfaces() diese Interfaces des Hosts
// mit - ohne Ausschluss würde z.B. docker0 als 65536 Adressen großes "LAN"
// gescannt und den Sweep in einen Timeout laufen lassen.
const VIRTUAL_INTERFACE_PREFIXES = [
  "docker",
  "br-",
  "veth",
  "cni",
  "flannel",
  "cali",
  "virbr",
  "podman",
];

function isVpnInterfaceName(name: string): boolean {
  return VPN_PREFIXES.some((prefix) => name.toLowerCase().startsWith(prefix));
}

function isVirtualInterfaceName(name: string): boolean {
  return VIRTUAL_INTERFACE_PREFIXES.some((prefix) => name.toLowerCase().startsWith(prefix));
}

function ipToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function netmaskToPrefixLength(netmask: string): number {
  return netmaskToPrefixLengthFromInt(ipToInt(netmask));
}

function netmaskToPrefixLengthFromInt(mask: number): number {
  let bits = 0;
  for (let i = 31; i >= 0; i--) {
    if ((mask >>> i) & 1) bits++;
    else break;
  }
  return bits;
}

function intToIp(int: number): string {
  return [24, 16, 8, 0].map((shift) => (int >>> shift) & 0xff).join(".");
}

// Ermittelt aus Adresse+Netmask eines Interfaces die zu scannende CIDR-Range.
// Punkt-zu-Punkt-Interfaces (/32, typisch bei WireGuard-Clients) haben als
// Netmask keine sinnvolle Range - dort wird fest auf /24 aufgerundet, nie
// größer, damit kein übergroßes Netz gescannt wird.
function rangeFromInterface(address: string, netmask: string): string {
  const prefixLength = netmaskToPrefixLength(netmask);
  const effectivePrefix = prefixLength === 32 ? 24 : prefixLength;
  const mask = effectivePrefix === 0 ? 0 : (0xffffffff << (32 - effectivePrefix)) >>> 0;
  const network = ipToInt(address) & mask;
  return `${intToIp(network)}/${effectivePrefix}`;
}

// Erste Host-Adresse einer CIDR-Range (Netzwerkadresse + 1) - bei
// Heimroutern (Fritzbox, aber auch die meisten anderen) so gut wie immer
// die Adresse des Routers selbst. Dient als Fallback-DNS-Server, wenn sich
// das tatsächliche Gateway eines Interfaces nicht per Routing-Tabelle
// ermitteln lässt (siehe gateway.ts).
export function firstHostOfCidr(cidr: string): string | null {
  const [address, prefixStr] = cidr.split("/");
  const prefixLength = Number(prefixStr);
  if (!address || Number.isNaN(prefixLength) || prefixLength >= 31) return null;
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  const network = ipToInt(address) & mask;
  return intToIp((network + 1) >>> 0);
}

// Prüft, ob eine IPv4-Adresse innerhalb einer CIDR-Range liegt (für die
// Zuordnung eines gefundenen Hosts zur Range, aus der er stammt).
export function ipInCidr(ip: string, cidr: string): boolean {
  const [rangeAddress, prefixStr] = cidr.split("/");
  const prefixLength = Number(prefixStr);
  if (!rangeAddress || Number.isNaN(prefixLength)) return false;
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  try {
    return (ipToInt(ip) & mask) === (ipToInt(rangeAddress) & mask);
  } catch {
    return false;
  }
}

// Erkennt alle nicht-internen IPv4-Interfaces des lokalen Hosts (auf dem
// netmaster selbst läuft) und klassifiziert sie per Namens-Heuristik als
// LAN oder VPN. Mehrere Interfaces derselben Art erzeugen mehrere Ranges.
export function detectLocalRanges(): DetectedRange[] {
  const interfaces = os.networkInterfaces();
  const results: DetectedRange[] = [];

  for (const name of Object.keys(interfaces)) {
    if (isVirtualInterfaceName(name)) continue;
    const entries = interfaces[name] ?? [];
    for (const entry of entries) {
      if (entry.internal || entry.family !== "IPv4") continue;
      const cidr = rangeFromInterface(entry.address, entry.netmask);
      // Sicherheitsnetz: größer als /16 wird nie automatisch übernommen,
      // egal welches Interface es meldet - ein Sweep über mehr als 65536
      // Adressen ist nie beabsichtigt und würde den Scan in einen Timeout
      // laufen lassen.
      const prefixLength = Number(cidr.split("/")[1]);
      if (prefixLength < 16) continue;
      results.push({
        cidr,
        source: isVpnInterfaceName(name) ? "VPN_AUTO" : "LAN_AUTO",
        interfaceName: name,
      });
      break; // eine Range pro Interface reicht (mehrere IPv4-Adressen je Interface sind selten)
    }
  }

  return results;
}
