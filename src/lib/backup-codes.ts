import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

const CODE_COUNT = 10;

function formatCode(): string {
  // 10 Zeichen aus [23456789ABCDEFGHJKLMNPQRSTUVWXYZ] (ohne 0/O/1/I/L zur
  // besseren Lesbarkeit), als XXXXX-XXXXX dargestellt.
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = randomBytes(10);
  let raw = "";
  for (const b of bytes) raw += alphabet[b % alphabet.length];
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
}

// Generiert neue Backup-Codes, ersetzt alle vorhandenen für den User und
// gibt die Klartext-Codes einmalig zurück (werden nur gehasht gespeichert).
export async function generateBackupCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: CODE_COUNT }, formatCode);
  await prisma.backupCode.deleteMany({ where: { userId } });
  await prisma.backupCode.createMany({
    data: await Promise.all(
      codes.map(async (code) => ({
        userId,
        codeHash: await bcrypt.hash(code, 10),
      }))
    ),
  });
  return codes;
}

// Prüft einen Backup-Code und markiert ihn bei Erfolg als verbraucht
// (einmal verwendbar).
export async function consumeBackupCode(
  userId: string,
  code: string
): Promise<boolean> {
  const candidates = await prisma.backupCode.findMany({
    where: { userId, usedAt: null },
  });
  for (const candidate of candidates) {
    if (await bcrypt.compare(code, candidate.codeHash)) {
      await prisma.backupCode.update({
        where: { id: candidate.id },
        data: { usedAt: new Date() },
      });
      return true;
    }
  }
  return false;
}
