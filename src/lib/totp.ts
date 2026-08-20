import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import { prisma } from "./prisma";

const ISSUER = "NetMaster";
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 60 * 1000;

export function generateTotpSecret(): string {
  return generateSecret();
}

export async function generateTotpQrCode(
  email: string,
  secret: string
): Promise<string> {
  const otpauth = generateURI({ issuer: ISSUER, label: email, secret });
  return QRCode.toDataURL(otpauth);
}

async function checkTotpCode(secret: string, code: string): Promise<boolean> {
  try {
    return (await verify({ secret, token: code })).valid;
  } catch {
    return false;
  }
}

// Prüft einen TOTP-Code inkl. einfachem Lockout nach MAX_FAILED_ATTEMPTS
// Fehlversuchen (LOCKOUT_MS Sperre). Setzt den Fehlzähler bei Erfolg zurück.
export async function verifyTotpCode(
  userId: string,
  code: string
): Promise<{ ok: boolean; lockedUntil?: Date }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.totpSecret) return { ok: false };

  if (user.totpLockedUntil && user.totpLockedUntil > new Date()) {
    return { ok: false, lockedUntil: user.totpLockedUntil };
  }

  const valid = await checkTotpCode(user.totpSecret, code);
  if (!valid) {
    const failedAttempts = user.totpFailedAttempts + 1;
    const lockedUntil =
      failedAttempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_MS)
        : null;
    await prisma.user.update({
      where: { id: userId },
      data: {
        totpFailedAttempts: lockedUntil ? 0 : failedAttempts,
        totpLockedUntil: lockedUntil,
      },
    });
    return { ok: false, lockedUntil: lockedUntil ?? undefined };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { totpFailedAttempts: 0, totpLockedUntil: null },
  });
  return { ok: true };
}

// Nur für die Setup-Verifikation (kein Lockout nötig, User ist bereits
// per Passwort authentifiziert).
export async function verifyTotpSetupCode(secret: string, code: string): Promise<boolean> {
  return checkTotpCode(secret, code);
}
