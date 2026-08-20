import { prisma } from "./prisma";
import type { SessionPayload } from "./session-token";

// Protokolliert nur Metadaten (wer/wann/was), keine Ein-/Ausgabe von
// Terminal-Sessions oder Befehlsinhalte.
export async function writeAuditLog(
  session: SessionPayload,
  action: string,
  options: { serverId?: string; detail?: string } = {}
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        userEmail: session.email,
        serverId: options.serverId,
        action,
        detail: options.detail ?? "",
      },
    });
  } catch (err) {
    console.error("Audit-Log konnte nicht geschrieben werden:", err);
  }
}

// Variante ohne Session-Kontext, für Aktionen außerhalb einer eingeloggten
// Anfrage (z.B. "netmaster reset-login" über die Shell).
export async function writeAuditLogRaw(
  actor: { userId: string; userEmail: string },
  action: string,
  options: { detail?: string } = {}
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: actor.userId,
        userEmail: actor.userEmail,
        action,
        detail: options.detail ?? "",
      },
    });
  } catch (err) {
    console.error("Audit-Log konnte nicht geschrieben werden:", err);
  }
}
