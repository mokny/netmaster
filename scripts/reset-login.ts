// Fully resets a user's login: new random password, removes all passkeys +
// TOTP secret/backup codes, revokes all sessions. Covers both "forgot
// password" AND "lost passkey/authenticator" - both lead to the same clean
// starting state.
//
// Invocation (via the netmaster CLI): netmaster reset-login <email>
// Directly inside the container: npx tsx scripts/reset-login.ts <email>
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
  // 20 readable characters (no easily confused symbols), enough entropy for
  // a one-time password that must be replaced immediately after login.
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
  const bytes = randomBytes(20);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  if (!email) {
    console.error("Usage: reset-login <email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found with email "${email}".`);
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

  console.log(`Login for ${email} has been reset.`);
  console.log(`Temporary password: ${tempPassword}`);
  console.log("The user must set a new password immediately on next login.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
