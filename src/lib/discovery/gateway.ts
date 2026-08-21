import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";

const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 5_000 }, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(stdout);
    });
  });
}

// Ermittelt das Default-Gateway eines Interfaces über die Routing-Tabelle
// (Linux `ip route`). Liefert null, wenn das Interface keine Default-Route
// hat (z.B. reine Punkt-zu-Punkt-VPN-Interfaces) oder `ip` nicht verfügbar
// ist (z.B. macOS-Dev-Umgebung) - der Aufrufer behandelt das als "kein
// zusätzlicher DNS-Server bekannt", nicht als Fehler.
export async function detectGatewayForInterface(interfaceName: string): Promise<string | null> {
  try {
    const stdout = await run("ip", ["route", "show", "default"]);
    for (const line of stdout.split("\n")) {
      const match = line.match(/^default via (\d{1,3}(?:\.\d{1,3}){3}) dev (\S+)/);
      if (match && match[2] === interfaceName) return match[1];
    }
  } catch {
    // kein `ip`-Kommando oder keine Default-Route - kein Gateway ermittelbar
  }
  return null;
}

// Liest die im System konfigurierten Nameserver aus /etc/resolv.conf. Im
// Docker-Container mit network_mode: host entspricht das der Host-Config.
// Nur IPv4, konsistent mit dem restlichen Discovery-Feature.
export function readSystemDnsServers(): string[] {
  try {
    const content = readFileSync("/etc/resolv.conf", "utf8");
    const servers: string[] = [];
    for (const line of content.split("\n")) {
      const match = line.trim().match(/^nameserver\s+(\S+)/);
      if (match && IPV4_PATTERN.test(match[1])) servers.push(match[1]);
    }
    return servers;
  } catch {
    return [];
  }
}
