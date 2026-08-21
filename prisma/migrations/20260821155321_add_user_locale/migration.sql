-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "totpFailedAttempts" INTEGER NOT NULL DEFAULT 0,
    "totpLockedUntil" DATETIME
);
INSERT INTO "new_User" ("createdAt", "email", "id", "mustChangePassword", "name", "passwordHash", "role", "totpEnabled", "totpFailedAttempts", "totpLockedUntil", "totpSecret") SELECT "createdAt", "email", "id", "mustChangePassword", "name", "passwordHash", "role", "totpEnabled", "totpFailedAttempts", "totpLockedUntil", "totpSecret" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
