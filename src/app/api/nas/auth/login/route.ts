import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyNasPassword, createNasUserSession } from "@/lib/nas-auth";
import { createNasPreAuthToken } from "@/lib/nas-session-token";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "EMAIL_PASSWORD_REQUIRED" },
      { status: 400 }
    );
  }

  const nasUser = await prisma.nasUser.findUnique({ where: { email } });
  if (!nasUser) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  const valid = await verifyNasPassword(password, nasUser.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  if (nasUser.totpEnabled) {
    const preAuthToken = await createNasPreAuthToken(nasUser.id);
    return NextResponse.json({ requiresTotp: true, preAuthToken });
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
