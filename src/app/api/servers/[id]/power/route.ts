import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError, ApiError } from "@/lib/api-helpers";
import { execOnServer, buildPowerCommand, type PowerAction } from "@/lib/ssh";
import { writeAuditLog } from "@/lib/audit";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { id } = await params;
    const body = await req.json();

    const action: PowerAction = body.action === "shutdown" ? "shutdown" : "reboot";
    if (action !== "reboot" && action !== "shutdown") {
      throw new ApiError(400, "Ungültige Aktion");
    }

    const server = await prisma.server.findUniqueOrThrow({ where: { id } });

    let command: string;
    let stdin: string | undefined;
    try {
      ({ command, stdin } = buildPowerCommand(server, action));
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : "Ungültige Konfiguration");
    }

    let sent = false;
    try {
      const result = await execOnServer(server, command, 15_000, stdin, () => {
        sent = true;
      });
      // Bei einem tatsächlichen Reboot/Shutdown kann die Verbindung reißen,
      // bevor der Exit-Code zurückkommt — ein Nicht-Null-Code weist hier
      // meist auf ein echtes Problem hin (z.B. falsches Sudo-Passwort).
      if (result.code !== 0 && result.code !== null) {
        throw new ApiError(500, result.stderr.trim() || `${action} fehlgeschlagen`);
      }
    } catch (err) {
      if (!sent) {
        // Befehl wurde noch nicht abgesetzt (z.B. Verbindungsaufbau
        // fehlgeschlagen) -> als echten Fehler behandeln.
        throw err;
      }
      // Befehl wurde bereits gesendet; ein danach auftretender
      // Verbindungsabbruch/Timeout ist bei reboot/shutdown erwartet.
    }

    await writeAuditLog(session, `server.${action}`, {
      serverId: id,
      detail: `action=${action}`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
