import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createNasUserSession } from "@/lib/nas-auth";
import { verifyNasPreAuthToken } from "@/lib/nas-session-token";
import { verifyNasTotpCode } from "@/lib/nas-totp";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const preAuthToken = typeof body?.preAuthToken === "string" ? body.preAuthToken : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  if (!preAuthToken || !code) {
    return NextResponse.json({ error: "TOTP_CODE_REQUIRED" }, { status: 400 });
  }

  const claims = await verifyNasPreAuthToken(preAuthToken);
  if (!claims) {
    return NextResponse.json({ error: "LOGIN_EXPIRED" }, { status: 401 });
  }

  const nasUser = await prisma.nasUser.findUnique({ where: { id: claims.nasUserId } });
  if (!nasUser || !nasUser.totpEnabled) {
    return NextResponse.json({ error: "INVALID_LOGIN" }, { status: 401 });
  }

  const result = await verifyNasTotpCode(nasUser.id, code);
  if (!result.ok) {
    if (result.lockedUntil) {
      return NextResponse.json({ error: "TOTP_TOO_MANY_ATTEMPTS" }, { status: 429 });
    }
    return NextResponse.json({ error: "INVALID_TOTP_CODE" }, { status: 401 });
  }

  await createNasUserSession(nasUser, req.headers.get("user-agent") ?? "");

  return NextResponse.json({
    nasUser: {
      id: nasUser.id,
      email: nasUser.email,
      name: nasUser.name,
      mustChangePassword: nasUser.mustChangePassword,
    },
  });
}
