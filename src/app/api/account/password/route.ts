import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { requireSession, handleApiError, ApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => null);
    const password = typeof body?.password === "string" ? body.password : "";
    const revokeOtherSessions = body?.revokeOtherSessions === true;

    if (password.length < 8) {
      throw new ApiError(400, "Passwort muss mindestens 8 Zeichen lang sein");
    }

    await prisma.user.update({
      where: { id: session.userId },
      data: { passwordHash: await hashPassword(password), mustChangePassword: false },
    });

    // JWT-Claim mustChangePassword neu ausstellen, sonst leitet proxy.ts mit
    // dem alten (optimistischen) Cookie weiter auf die Zwangs-Änderungsseite um.
    await setSessionCookie(session.sessionId, { ...session, mustChangePassword: false });

    if (revokeOtherSessions) {
      await prisma.session.updateMany({
        where: { userId: session.userId, id: { not: session.sessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await writeAuditLog(session, "account.password_change", {
      detail: revokeOtherSessions ? "andere Sessions beendet" : "",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
