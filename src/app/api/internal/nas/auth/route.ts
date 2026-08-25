import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyNasPassword } from "@/lib/nas-auth";
import { requireInternalSecret } from "@/lib/nas-internal-auth";

// Vom Gateway für jeden FTP/SFTP/Samba-Login-Versuch aufgerufen (kein
// Passwort-Caching im Gateway - jede Verbindung prüft live gegen die
// zentrale NasUser-Tabelle). Liefert bei Erfolg die Freigaben, auf die
// dieser NAS-User zugreifen darf, inkl. Rolle.
export async function POST(req: Request) {
  const authError = requireInternalSecret(req);
  if (authError) return authError;

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const nasUser = await prisma.nasUser.findUnique({
    where: { email },
    include: { memberships: { include: { share: true } } },
  });
  if (!nasUser || !(await verifyNasPassword(password, nasUser.passwordHash))) {
    return NextResponse.json({ ok: false });
  }

  return NextResponse.json({
    ok: true,
    nasUserId: nasUser.id,
    shares: nasUser.memberships.map((m) => ({
      shareId: m.shareId,
      role: m.role,
      readOnlyLocked: m.share.readOnlyLocked,
    })),
  });
}
