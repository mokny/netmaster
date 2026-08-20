import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

export async function POST() {
  try {
    const session = await requireSession();

    await prisma.$transaction([
      prisma.user.update({
        where: { id: session.userId },
        data: { totpSecret: null, totpEnabled: false, totpFailedAttempts: 0, totpLockedUntil: null },
      }),
      prisma.backupCode.deleteMany({ where: { userId: session.userId } }),
      prisma.session.updateMany({
        where: { userId: session.userId, id: { not: session.sessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await writeAuditLog(session, "account.totp_disabled", {
      detail: "andere Sessions beendet",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
