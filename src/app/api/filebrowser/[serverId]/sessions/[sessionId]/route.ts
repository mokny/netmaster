import { NextResponse } from "next/server";
import { requireFbContext, handleFbError } from "@/lib/filebrowser/route-helpers";
import { FbAccessError } from "@/lib/filebrowser/access";
import { revokeFbSession } from "@/lib/filebrowser/session";

// Beendet eine einzelne eigene Session ("Beenden"-Button je Gerät in der
// Sessions-Ansicht). revokeFbSession prüft selbst, dass die Session
// tatsächlich (serverId, username) gehört - eine erratene fremde ID revoked
// hier nichts.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ serverId: string; sessionId: string }> }
) {
  try {
    const { serverId, sessionId } = await params;
    const ctx = await requireFbContext(serverId);
    const ok = await revokeFbSession(serverId, ctx.username, sessionId);
    if (!ok) throw new FbAccessError(404, "SESSION_NOT_FOUND");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleFbError(err);
  }
}
