import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-helpers";
import { generateTotpSecret, generateTotpQrCode } from "@/lib/totp";

// Erzeugt ein neues (noch nicht aktives) TOTP-Secret. totpEnabled bleibt
// false, bis /api/account/totp/verify den ersten Code erfolgreich prüft.
export async function POST() {
  try {
    const session = await requireSession();

    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
    if (await prisma.webAuthnCredential.count({ where: { userId: session.userId } })) {
      throw new ApiError(400, "TOTP_BLOCKED_BY_PASSKEY");
    }

    const secret = generateTotpSecret();
    await prisma.user.update({
      where: { id: session.userId },
      data: { totpSecret: secret, totpEnabled: false },
    });

    const qrCodeDataUrl = await generateTotpQrCode(user.email, secret);

    return NextResponse.json({ secret, qrCodeDataUrl });
  } catch (err) {
    return handleApiError(err);
  }
}
