import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import type { SessionDTO } from "@/lib/types";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await params;
    const sessions = await prisma.session.findMany({
      where: { userId: id, revokedAt: null },
      orderBy: { lastSeenAt: "desc" },
    });

    const dto: SessionDTO[] = sessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      isCurrent: s.id === session.sessionId,
    }));

    return NextResponse.json({ sessions: dto });
  } catch (err) {
    return handleApiError(err);
  }
}

// Alle Sessions eines Nutzers beenden (z.B. bei kompromittiertem Account).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await params;
    await prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await writeAuditLog(session, "user.sessions_revoke_all", { detail: `userId=${id}` });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
