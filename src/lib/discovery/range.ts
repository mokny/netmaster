import os from "node:os";

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

// Ermittelt die zu scannende Standard-Range aus der ersten nicht-internen
// IPv4-Schnittstelle des Hosts (z.B. 192.168.1.42/24 -> "192.168.1.0/24").
// Wird als Vorschlag verwendet, solange kein manueller Override gesetzt ist.
export function detectDefaultRange(): string | null {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const entries = interfaces[name] ?? [];
    for (const entry of entries) {
      if (entry.internal || entry.family !== "IPv4") continue;
      const prefixLength = netmaskToPrefixLength(entry.netmask);
      const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
      const network = ipToInt(entry.address) & mask;
      return `${intToIp(network)}/${prefixLength}`;
    }
  }
  return null;
}
