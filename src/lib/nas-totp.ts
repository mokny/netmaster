import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import { prisma } from "./prisma";

// 1:1-Kopie des Musters aus totp.ts, aber gegen NasUser statt User - siehe
// nas-session-token.ts für die Begründung, warum hier bewusst nicht
// wiederverwendet/generalisiert wird. Keine Backup-Codes für NAS-User (out
// of scope für den ersten Wurf, siehe Plan).
const ISSUER = "NetMaster NAS";
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 60 * 1000;

export function generateNasTotpSecret(): string {
  return generateSecret();
}

export async function generateNasTotpQrCode(
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

export async function verifyNasTotpCode(
  nasUserId: string,
  code: string
): Promise<{ ok: boolean; lockedUntil?: Date }> {
  const nasUser = await prisma.nasUser.findUnique({ where: { id: nasUserId } });
  if (!nasUser?.totpSecret) return { ok: false };

  if (nasUser.totpLockedUntil && nasUser.totpLockedUntil > new Date()) {
    return { ok: false, lockedUntil: nasUser.totpLockedUntil };
  }

  const valid = await checkTotpCode(nasUser.totpSecret, code);
  if (!valid) {
    const failedAttempts = nasUser.totpFailedAttempts + 1;
    const lockedUntil =
      failedAttempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_MS)
        : null;
    await prisma.nasUser.update({
      where: { id: nasUserId },
      data: {
        totpFailedAttempts: lockedUntil ? 0 : failedAttempts,
        totpLockedUntil: lockedUntil,
      },
    });
    return { ok: false, lockedUntil: lockedUntil ?? undefined };
  }

  await prisma.nasUser.update({
    where: { id: nasUserId },
    data: { totpFailedAttempts: 0, totpLockedUntil: null },
  });
  return { ok: true };
}

export async function verifyNasTotpSetupCode(secret: string, code: string): Promise<boolean> {
  return checkTotpCode(secret, code);
}
