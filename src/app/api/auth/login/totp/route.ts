import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createUserSession } from "@/lib/auth";
import { verifyPreAuthToken } from "@/lib/session-token";
import { verifyTotpCode } from "@/lib/totp";
import { consumeBackupCode } from "@/lib/backup-codes";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const preAuthToken = typeof body?.preAuthToken === "string" ? body.preAuthToken : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  if (!preAuthToken || !code) {
    return NextResponse.json({ error: "Code erforderlich" }, { status: 400 });
  }

  const claims = await verifyPreAuthToken(preAuthToken);
  if (!claims) {
    return NextResponse.json(
      { error: "Anmeldung abgelaufen, bitte erneut mit Passwort anmelden." },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id: claims.userId } });
  if (!user || !user.totpEnabled) {
    return NextResponse.json({ error: "Ungültige Anmeldung" }, { status: 401 });
  }

  const isBackupCode = /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(code.toUpperCase());
  if (isBackupCode) {
    if (!(await consumeBackupCode(user.id, code.toUpperCase()))) {
      return NextResponse.json({ error: "Ungültiger Backup-Code" }, { status: 401 });
    }
  } else {
    const result = await verifyTotpCode(user.id, code);
    if (!result.ok) {
      if (result.lockedUntil) {
        return NextResponse.json(
          { error: "Zu viele Fehlversuche. Bitte in einer Minute erneut versuchen." },
          { status: 429 }
        );
      }
      return NextResponse.json({ error: "Ungültiger Code" }, { status: 401 });
    }
  }

  await createUserSession(user, req.headers.get("user-agent") ?? "");

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
  });
}
