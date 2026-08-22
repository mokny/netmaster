import type { Server as ServerModel } from "@/generated/prisma/client";
import { detectFirewallBackend, buildSimpleAddScript } from "@/lib/firewall";
import { runRootScript } from "./exec";

export interface PortSpec {
  port: number;
  protocol: "tcp" | "udp";
}

// Öffnet die übergebenen Ports in der Server-Firewall, falls für den Server
// ein unterstütztes Backend erkannt wird - reine "allow"-Regeln (kein
// Lockout-Risiko wie bei Deny-Regeln), daher ohne den Rollback-Guard aus
// applyGuarded. Fehler werden bewusst verschluckt: das Öffnen der Firewall
// ist ein Komfort-Zusatz zur eigentlichen NFS/Samba-Einrichtung, kein
// Grund, diese fehlschlagen zu lassen.
export async function openFirewallPorts(server: ServerModel, ports: PortSpec[], markerPrefix: string) {
  try {
    const backend = await detectFirewallBackend(server);
    if (backend === "none") return;
    const script = ports
      .map((p) =>
        buildSimpleAddScript(backend, `${markerPrefix}-${p.protocol}-${p.port}`, {
          action: "allow",
          protocol: p.protocol,
          port: p.port,
          source: null,
        })
      )
      .join("\n");
    await runRootScript(server, script, 15_000);
  } catch {
    // best effort
  }
}
