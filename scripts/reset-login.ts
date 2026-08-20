// Setzt den Login eines Users vollständig zurück: neues Zufallspasswort,
// entfernt alle Passkeys + TOTP-Secret/Backup-Codes, widerruft alle Sessions.
// Für den Fall "Passwort vergessen" ODER "Passkey/Authenticator verloren" –
// beide führen zum selben sauberen Ausgangszustand.
//
// Aufruf (über die netmaster-CLI): netmaster reset-login <email>
// Direkt im Container: npx tsx scripts/reset-login.ts <email>
import "dotenv/config";
import { randomBytes } from "crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});
const prisma = new PrismaClient({ adapter });

function generateTempPassword(): string {
  // 20 lesbare Zeichen (ohne verwechselbare Symbole), ausreichend Entropie
  // für ein Einmal-Passwort, das sofort nach Login ersetzt werden muss.
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
  const bytes = randomBytes(20);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  if (!email) {
    console.error("Verwendung: reset-login <email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`Kein User mit E-Mail "${email}" gefunden.`);
    process.exit(1);
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: true,
        totpSecret: null,
        totpEnabled: false,
        totpFailedAttempts: 0,
        totpLockedUntil: null,
      },
    }),
    prisma.webAuthnCredential.deleteMany({ where: { userId: user.id } }),
    prisma.backupCode.deleteMany({ where: { userId: user.id } }),
    prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        userEmail: user.email,
        action: "account.login_reset",
        detail: "via shell (netmaster reset-login)",
      },
    }),
  ]);

  console.log(`Login für ${email} zurückgesetzt.`);
  console.log(`Temporäres Passwort: ${tempPassword}`);
  console.log("Der User muss beim nächsten Login sofort ein neues Passwort setzen.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
