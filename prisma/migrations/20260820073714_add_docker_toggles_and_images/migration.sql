-- CreateTable
CREATE TABLE "DockerImageSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "imageId" TEXT NOT NULL,
    "repository" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "sizeMb" REAL,
    "createdLabel" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "DockerImageSnapshot_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Server" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "sshPort" INTEGER NOT NULL DEFAULT 22,
    "sshUsername" TEXT NOT NULL,
    "authType" TEXT NOT NULL DEFAULT 'PASSWORD',
    "encryptedSecret" TEXT NOT NULL,
    "encryptedPassphrase" TEXT,
    "encryptedSudoPassword" TEXT,
    "pollIntervalSec" INTEGER NOT NULL DEFAULT 30,
    "retentionDays" INTEGER NOT NULL DEFAULT 30,
    "dockerEnabled" BOOLEAN NOT NULL DEFAULT true,
    "proxmoxEnabled" BOOLEAN NOT NULL DEFAULT true,
    "cpuWarn" REAL NOT NULL DEFAULT 70,
    "cpuCrit" REAL NOT NULL DEFAULT 90,
    "memWarn" REAL NOT NULL DEFAULT 75,
    "memCrit" REAL NOT NULL DEFAULT 90,
    "diskWarn" REAL NOT NULL DEFAULT 80,
    "diskCrit" REAL NOT NULL DEFAULT 95,
    "description" TEXT NOT NULL DEFAULT '',
    "tags" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastError" TEXT,
    "lastCheckedAt" DATETIME
);
INSERT INTO "new_Server" ("authType", "cpuCrit", "cpuWarn", "createdAt", "description", "diskCrit", "diskWarn", "encryptedPassphrase", "encryptedSecret", "encryptedSudoPassword", "hostname", "id", "lastCheckedAt", "lastError", "lastStatus", "memCrit", "memWarn", "name", "pollIntervalSec", "retentionDays", "sshPort", "sshUsername", "tags", "updatedAt") SELECT "authType", "cpuCrit", "cpuWarn", "createdAt", "description", "diskCrit", "diskWarn", "encryptedPassphrase", "encryptedSecret", "encryptedSudoPassword", "hostname", "id", "lastCheckedAt", "lastError", "lastStatus", "memCrit", "memWarn", "name", "pollIntervalSec", "retentionDays", "sshPort", "sshUsername", "tags", "updatedAt" FROM "Server";
DROP TABLE "Server";
ALTER TABLE "new_Server" RENAME TO "Server";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "DockerImageSnapshot_serverId_timestamp_idx" ON "DockerImageSnapshot"("serverId", "timestamp");
