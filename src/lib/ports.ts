// Kombinierter Befehl: Listening-Ports + aktive Verbindungen (-tupn) sowie
// alle lokalen Interface-IPs (für die Multi-Host-Topologie-Korrelation) in
// einer SSH-Session. -p (Programm/PID) benötigt in der Regel root-Rechte.
export const PORTS_COMMAND = `
echo "__SS__"; ss -H -tupn 2>/dev/null;
echo "__IFACES__"; ip -o addr show 2>/dev/null | awk '{print $2, $3, $4}';
`.trim();

export interface PortEntry {
  protocol: "tcp" | "udp";
  state: string; // LISTEN, ESTAB, ...
  localAddress: string;
  localPort: number;
  peerAddress: string | null;
  peerPort: number | null;
  program: string | null;
  pid: number | null;
}

function splitAddrPort(value: string): { address: string; port: number | null } {
  // IPv6 kommt als [::]:22, IPv4 als 0.0.0.0:22
  const m = value.match(/^\[(.+)\]:(\d+|\*)$/) ?? value.match(/^(.+):(\d+|\*)$/);
  if (!m) return { address: value, port: null };
  const port = m[2] === "*" ? null : Number(m[2]);
  return { address: m[1], port };
}

function parseSsOutput(block: string): PortEntry[] {
  const entries: PortEntry[] = [];
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cols = trimmed.split(/\s+/);
    if (cols.length < 5) continue;
    const [protoRaw, state, , , local, peer] = cols;
    const protocol = protoRaw.toLowerCase() === "udp" ? "udp" : "tcp";
    const { address: localAddress, port: localPort } = splitAddrPort(local);
    const { address: peerAddress, port: peerPort } = splitAddrPort(peer ?? "");

    const procMatch = trimmed.match(/\(\("([^"]+)",pid=(\d+)/);

    entries.push({
      protocol,
      state,
      localAddress,
      localPort: localPort ?? 0,
      peerAddress: peerAddress && peerAddress !== "*" ? peerAddress : null,
      peerPort,
      program: procMatch ? procMatch[1] : null,
      pid: procMatch ? Number(procMatch[2]) : null,
    });
  }
  return entries;
}

export interface InterfaceAddress {
  iface: string;
  address: string; // ohne CIDR-Suffix
}

function parseInterfaces(block: string): InterfaceAddress[] {
  const out: InterfaceAddress[] = [];
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cols = trimmed.split(/\s+/);
    if (cols.length < 3) continue;
    const [iface, family, cidr] = cols;
    if (family !== "inet" && family !== "inet6") continue;
    const address = cidr.split("/")[0];
    if (address === "127.0.0.1" || address === "::1") continue;
    out.push({ iface, address });
  }
  return out;
}

export interface PortsSnapshot {
  ports: PortEntry[];
  interfaces: InterfaceAddress[];
}

export function parsePortsOutput(stdout: string): PortsSnapshot {
  const ssMatch = stdout.match(/__SS__\n([\s\S]*?)__IFACES__/);
  const ifaceMatch = stdout.match(/__IFACES__\n([\s\S]*)$/);
  return {
    ports: ssMatch ? parseSsOutput(ssMatch[1]) : [],
    interfaces: ifaceMatch ? parseInterfaces(ifaceMatch[1]) : [],
  };
}
