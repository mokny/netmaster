import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-helpers";
import type { SessionDTO } from "@/lib/types";

export async function GET() {
  try {
    const session = await requireSession();
    const sessions = await prisma.session.findMany({
      where: { userId: session.userId, revokedAt: null },
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

// Alle Sessions außer der aktuellen beenden.
export async function DELETE() {
  try {
    const session = await requireSession();
    await prisma.session.updateMany({
      where: { userId: session.userId, id: { not: session.sessionId }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
