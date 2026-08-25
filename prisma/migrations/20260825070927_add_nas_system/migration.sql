-- CreateTable
CREATE TABLE "NasUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "canCreatePublicLinks" BOOLEAN NOT NULL DEFAULT true,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "totpFailedAttempts" INTEGER NOT NULL DEFAULT 0,
    "totpLockedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NasSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nasUserId" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    CONSTRAINT "NasSession_nasUserId_fkey" FOREIGN KEY ("nasUserId") REFERENCES "NasUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NasShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "remotePath" TEXT NOT NULL,
    "mountTransport" TEXT NOT NULL DEFAULT 'SSHFS',
    "quotaBytes" BIGINT,
    "usedBytes" BIGINT NOT NULL DEFAULT 0,
    "lastUsageCheckAt" DATETIME,
    "readOnlyLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NasShare_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NasShareMember" (
    "shareId" TEXT NOT NULL,
    "nasUserId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'READ_WRITE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NasShareMember_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "NasShare" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NasShareMember_nasUserId_fkey" FOREIGN KEY ("nasUserId") REFERENCES "NasUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NasShareLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shareId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdByNasUserId" TEXT NOT NULL,
    "passwordHash" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NasShareLink_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "NasShare" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NasShareLink_createdByNasUserId_fkey" FOREIGN KEY ("createdByNasUserId") REFERENCES "NasUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NasAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nasUserId" TEXT,
    "nasUserEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "NasUser_email_key" ON "NasUser"("email");

-- CreateIndex
CREATE INDEX "NasSession_nasUserId_idx" ON "NasSession"("nasUserId");

-- CreateIndex
CREATE INDEX "NasShareMember_nasUserId_idx" ON "NasShareMember"("nasUserId");

-- CreateIndex
CREATE UNIQUE INDEX "NasShareMember_shareId_nasUserId_key" ON "NasShareMember"("shareId", "nasUserId");

-- CreateIndex
CREATE UNIQUE INDEX "NasShareLink_token_key" ON "NasShareLink"("token");

-- CreateIndex
CREATE INDEX "NasShareLink_shareId_idx" ON "NasShareLink"("shareId");

-- CreateIndex
CREATE INDEX "NasAuditLog_nasUserId_createdAt_idx" ON "NasAuditLog"("nasUserId", "createdAt");
