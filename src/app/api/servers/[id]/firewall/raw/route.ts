import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireRole,
  requireNetworkToolsEnabled,
  handleApiError,
  ApiError,
} from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { detectFirewallBackend, applyGuarded } from "@/lib/firewall";

// Advanced-Modus: führt vom Nutzer eingegebene rohe nft/iptables/ufw-Befehle
// aus, geschützt durch denselben Snapshot+Auto-Rollback-Mechanismus wie der
// Simple-Modus. Bewusst ungefiltert – gleiche Vertrauensstufe wie das
// bestehende Exec-Terminal bzw. Docker-"extraArgs"-Feld.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await params;
    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    requireNetworkToolsEnabled(server);

    const body = await req.json();
    const script = String(body.script ?? "").trim();
    if (!script) {
      throw new ApiError(400, "Skript darf nicht leer sein");
    }

    const backend = await detectFirewallBackend(server);
    if (backend === "none") {
      throw new ApiError(400, "Kein unterstütztes Firewall-Backend (nft/iptables/ufw) erkannt");
    }

    const result = await applyGuarded(server, backend, script, (confirmed) => {
      void writeAuditLog(
        session,
        confirmed ? "firewall.raw.confirmed" : "firewall.raw.reverted",
        { serverId: id, detail: script.slice(0, 500) }
      );
    });

    await writeAuditLog(session, "firewall.raw.apply", {
      serverId: id,
      detail: script.slice(0, 500),
    });

    return NextResponse.json({
      backend: result.backend,
      rollbackTimeoutMs: result.rollbackTimeoutMs,
      stdout: result.stdout,
      stderr: result.stderr,
      code: result.code,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
