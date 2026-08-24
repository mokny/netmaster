import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireWireguardEnabled, handleApiError, ApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { execOnServer, buildRootCommand, shellQuote } from "@/lib/ssh";
import { buildControlCommand, validateIfaceName, type WgAction } from "@/lib/wireguard";

const ACTIONS: WgAction[] = ["start", "stop", "restart", "enable", "disable"];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; iface: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { id, iface } = await params;
    validateIfaceName(iface);
    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    requireWireguardEnabled(server);

    const body = (await req.json()) as { action: WgAction };
    if (!ACTIONS.includes(body.action)) {
      throw new ApiError(400, "INVALID_ACTION");
    }

    const { command, stdin } = buildControlCommand(server, iface, body.action);
    const res = await execOnServer(server, command, 15_000, stdin);
    if (res.code !== 0) {
      let detail = res.stderr.trim() || body.action;
      // `systemctl start/restart` gibt bei einem fehlgeschlagenen
      // Startvorgang nur auf journalctl verweisenden Text zurück - die
      // eigentliche Ursache (z.B. ungültige Peer-Konfiguration, belegter
      // Port) steht erst im Journal des Units.
      if (body.action === "start" || body.action === "restart" || body.action === "enable") {
        try {
          const journalCmd = buildRootCommand(
            server,
            `journalctl -u ${shellQuote(`wg-quick@${iface}.service`)} --no-pager -n 15 2>/dev/null`
          );
          const journalRes = await execOnServer(server, journalCmd.command, 10_000, journalCmd.stdin);
          const journal = journalRes.stdout.trim();
          if (journal) detail = `${detail}\n${journal}`;
        } catch {
          // Zusatzinfo ist optional - Fehler hier sollen die eigentliche
          // ACTION_FAILED-Antwort nicht verschlucken.
        }
      }
      throw new ApiError(500, "ACTION_FAILED", detail);
    }

    await writeAuditLog(session, `wireguard.interface.${body.action}`, {
      serverId: id,
      detail: `Interface ${iface}`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
