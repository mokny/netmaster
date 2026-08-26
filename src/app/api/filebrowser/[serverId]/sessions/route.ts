import { NextResponse } from "next/server";
import { requireFbContext, handleFbError } from "@/lib/filebrowser/route-helpers";
import { listFbSessions, revokeOtherFbSessions } from "@/lib/filebrowser/session";

// Self-Service-Pendant zu /api/users/[id]/sessions (Admin-Bereich): der
// eingeloggte Samba-Web-User sieht/verwaltet NUR seine eigenen Sessions,
// kein Admin-Revoke o.ä. hier.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const ctx = await requireFbContext(serverId);
    const sessions = await listFbSessions(serverId, ctx.username);
    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        createdAt: s.createdAt.toISOString(),
        lastSeenAt: s.lastSeenAt.toISOString(),
        isCurrent: s.id === ctx.sessionId,
      })),
    });
  } catch (err) {
    return handleFbError(err);
  }
}

// "Alle anderen Geräte abmelden" - widerruft jede Session außer der
// aktuellen.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const ctx = await requireFbContext(serverId);
    const revoked = await revokeOtherFbSessions(serverId, ctx.username, ctx.sessionId);
    return NextResponse.json({ ok: true, revoked });
  } catch (err) {
    return handleFbError(err);
  }
}
