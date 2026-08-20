/*
  Warnings:

  - You are about to drop the column `criticalEnabled` on the `NotificationPreference` table. All the data in the column will be lost.
  - You are about to drop the column `warningEnabled` on the `NotificationPreference` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NotificationPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "offlineEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dockerStoppedEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cpuWarnEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cpuCritEnabled" BOOLEAN NOT NULL DEFAULT true,
    "memWarnEnabled" BOOLEAN NOT NULL DEFAULT false,
    "memCritEnabled" BOOLEAN NOT NULL DEFAULT true,
    "diskWarnEnabled" BOOLEAN NOT NULL DEFAULT false,
    "diskCritEnabled" BOOLEAN NOT NULL DEFAULT true,
    "netWarnEnabled" BOOLEAN NOT NULL DEFAULT false,
    "netCritEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NotificationPreference_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NotificationPreference" ("dockerStoppedEnabled", "id", "offlineEnabled", "serverId", "updatedAt", "userId") SELECT "dockerStoppedEnabled", "id", "offlineEnabled", "serverId", "updatedAt", "userId" FROM "NotificationPreference";
DROP TABLE "NotificationPreference";
ALTER TABLE "new_NotificationPreference" RENAME TO "NotificationPreference";
CREATE UNIQUE INDEX "NotificationPreference_userId_serverId_key" ON "NotificationPreference"("userId", "serverId");
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
    "networkToolsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cpuWarn" REAL NOT NULL DEFAULT 70,
    "cpuCrit" REAL NOT NULL DEFAULT 90,
    "memWarn" REAL NOT NULL DEFAULT 75,
    "memCrit" REAL NOT NULL DEFAULT 90,
    "diskWarn" REAL NOT NULL DEFAULT 80,
    "diskCrit" REAL NOT NULL DEFAULT 95,
    "netUploadWarn" REAL NOT NULL DEFAULT 800,
    "netUploadCrit" REAL NOT NULL DEFAULT 950,
    "netDownloadWarn" REAL NOT NULL DEFAULT 800,
    "netDownloadCrit" REAL NOT NULL DEFAULT 950,
    "description" TEXT NOT NULL DEFAULT '',
    "tags" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastError" TEXT,
    "lastCheckedAt" DATETIME,
    "lastCpuStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastMemStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastDiskStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastNetStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "cpuCores" INTEGER,
    "memTotalMb" REAL,
    "osName" TEXT,
    "kernelVersion" TEXT,
    "bootedAt" DATETIME
);
INSERT INTO "new_Server" ("authType", "bootedAt", "cpuCores", "cpuCrit", "cpuWarn", "createdAt", "description", "diskCrit", "diskWarn", "dockerEnabled", "encryptedPassphrase", "encryptedSecret", "encryptedSudoPassword", "hostname", "id", "kernelVersion", "lastCheckedAt", "lastError", "lastStatus", "memCrit", "memTotalMb", "memWarn", "name", "networkToolsEnabled", "osName", "pollIntervalSec", "proxmoxEnabled", "retentionDays", "sshPort", "sshUsername", "tags", "updatedAt") SELECT "authType", "bootedAt", "cpuCores", "cpuCrit", "cpuWarn", "createdAt", "description", "diskCrit", "diskWarn", "dockerEnabled", "encryptedPassphrase", "encryptedSecret", "encryptedSudoPassword", "hostname", "id", "kernelVersion", "lastCheckedAt", "lastError", "lastStatus", "memCrit", "memTotalMb", "memWarn", "name", "networkToolsEnabled", "osName", "pollIntervalSec", "proxmoxEnabled", "retentionDays", "sshPort", "sshUsername", "tags", "updatedAt" FROM "Server";
DROP TABLE "Server";
ALTER TABLE "new_Server" RENAME TO "Server";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
