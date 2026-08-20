import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createUserSession } from "@/lib/auth";
import { verifyAuthentication } from "@/lib/webauthn";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const response = body?.response as AuthenticationResponseJSON | undefined;
    if (!response) {
      return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
    }

    const { result, credential } = await verifyAuthentication(req, response);
    if (!result.verified) {
      return NextResponse.json({ error: "Passkey-Anmeldung fehlgeschlagen" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: credential.userId } });
    if (!user) {
      return NextResponse.json({ error: "Unbekannter Account" }, { status: 401 });
    }

    await prisma.webAuthnCredential.update({
      where: { id: credential.id },
      data: {
        counter: result.authenticationInfo.newCounter,
        lastUsedAt: new Date(),
      },
    });

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
  } catch (err) {
    const message = err instanceof Error ? err.message : "Passkey-Anmeldung fehlgeschlagen";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
