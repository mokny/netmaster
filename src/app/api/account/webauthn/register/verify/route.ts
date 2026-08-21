import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-helpers";
import { verifyRegistration } from "@/lib/webauthn";
import { writeAuditLog } from "@/lib/audit";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => null);
    const response = body?.response as RegistrationResponseJSON | undefined;
    const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim().slice(0, 60) : "Passkey";

    if (!response) throw new ApiError(400, "INVALID_REQUEST");

    const result = await verifyRegistration(req, session.userId, response);
    if (!result.verified || !result.registrationInfo) {
      throw new ApiError(400, "PASSKEY_REGISTRATION_FAILED");
    }

    const { credential } = result.registrationInfo;
    await prisma.webAuthnCredential.create({
      data: {
        userId: session.userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString("base64url"),
        counter: credential.counter,
        transports: credential.transports?.join(",") ?? "",
        name,
      },
    });

    await writeAuditLog(session, "account.passkey_added", { detail: name });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
