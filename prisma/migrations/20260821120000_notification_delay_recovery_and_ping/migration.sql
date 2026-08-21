-- AlterTable
ALTER TABLE "Server" ADD COLUMN "cpuCritSince" DATETIME;
ALTER TABLE "Server" ADD COLUMN "cpuWarnSince" DATETIME;
ALTER TABLE "Server" ADD COLUMN "diskCritSince" DATETIME;
ALTER TABLE "Server" ADD COLUMN "diskWarnSince" DATETIME;
ALTER TABLE "Server" ADD COLUMN "memCritSince" DATETIME;
ALTER TABLE "Server" ADD COLUMN "memWarnSince" DATETIME;
ALTER TABLE "Server" ADD COLUMN "netCritSince" DATETIME;
ALTER TABLE "Server" ADD COLUMN "netWarnSince" DATETIME;
ALTER TABLE "Server" ADD COLUMN "offlineSince" DATETIME;

-- CreateTable
CREATE TABLE "DockerContainerState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "running" BOOLEAN NOT NULL DEFAULT true,
    "stoppedSince" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DockerContainerState_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NotificationPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "offlineEnabled" BOOLEAN NOT NULL DEFAULT false,
    "offlineDelayMin" INTEGER NOT NULL DEFAULT 0,
    "offlineRecoveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dockerStoppedEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dockerStoppedDelayMin" INTEGER NOT NULL DEFAULT 0,
    "dockerStoppedRecoveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cpuWarnEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cpuWarnDelayMin" INTEGER NOT NULL DEFAULT 0,
    "cpuWarnRecoveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cpuCritEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cpuCritDelayMin" INTEGER NOT NULL DEFAULT 0,
    "cpuCritRecoveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "memWarnEnabled" BOOLEAN NOT NULL DEFAULT false,
    "memWarnDelayMin" INTEGER NOT NULL DEFAULT 0,
    "memWarnRecoveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "memCritEnabled" BOOLEAN NOT NULL DEFAULT false,
    "memCritDelayMin" INTEGER NOT NULL DEFAULT 0,
    "memCritRecoveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "diskWarnEnabled" BOOLEAN NOT NULL DEFAULT false,
    "diskWarnDelayMin" INTEGER NOT NULL DEFAULT 0,
    "diskWarnRecoveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "diskCritEnabled" BOOLEAN NOT NULL DEFAULT false,
    "diskCritDelayMin" INTEGER NOT NULL DEFAULT 0,
    "diskCritRecoveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "netWarnEnabled" BOOLEAN NOT NULL DEFAULT false,
    "netWarnDelayMin" INTEGER NOT NULL DEFAULT 0,
    "netWarnRecoveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "netCritEnabled" BOOLEAN NOT NULL DEFAULT false,
    "netCritDelayMin" INTEGER NOT NULL DEFAULT 0,
    "netCritRecoveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NotificationPreference_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NotificationPreference" ("cpuCritEnabled", "cpuWarnEnabled", "diskCritEnabled", "diskWarnEnabled", "dockerStoppedEnabled", "id", "memCritEnabled", "memWarnEnabled", "netCritEnabled", "netWarnEnabled", "offlineEnabled", "serverId", "updatedAt", "userId") SELECT "cpuCritEnabled", "cpuWarnEnabled", "diskCritEnabled", "diskWarnEnabled", "dockerStoppedEnabled", "id", "memCritEnabled", "memWarnEnabled", "netCritEnabled", "netWarnEnabled", "offlineEnabled", "serverId", "updatedAt", "userId" FROM "NotificationPreference";
DROP TABLE "NotificationPreference";
ALTER TABLE "new_NotificationPreference" RENAME TO "NotificationPreference";
CREATE UNIQUE INDEX "NotificationPreference_userId_serverId_key" ON "NotificationPreference"("userId", "serverId");
CREATE TABLE "new_ServiceCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "checkType" TEXT NOT NULL DEFAULT 'HTTP',
    "expectedStatus" INTEGER NOT NULL DEFAULT 200,
    "intervalSec" INTEGER NOT NULL DEFAULT 30,
    "timeoutMs" INTEGER NOT NULL DEFAULT 5000,
    "latencyWarnMs" INTEGER,
    "lastStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastLatencyMs" REAL,
    "lastCheckedAt" DATETIME,
    "lastError" TEXT,
    "downSince" DATETIME,
    "slowSince" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceCheck_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ServiceCheck" ("createdAt", "expectedStatus", "id", "intervalSec", "lastCheckedAt", "lastError", "lastLatencyMs", "lastStatus", "name", "serverId", "timeoutMs", "url") SELECT "createdAt", "expectedStatus", "id", "intervalSec", "lastCheckedAt", "lastError", "lastLatencyMs", "lastStatus", "name", "serverId", "timeoutMs", "url" FROM "ServiceCheck";
DROP TABLE "ServiceCheck";
ALTER TABLE "new_ServiceCheck" RENAME TO "ServiceCheck";
CREATE TABLE "new_ServiceCheckSubscriber" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceCheckId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "downEnabled" BOOLEAN NOT NULL DEFAULT false,
    "downDelayMin" INTEGER NOT NULL DEFAULT 0,
    "downRecoveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "slowEnabled" BOOLEAN NOT NULL DEFAULT false,
    "slowDelayMin" INTEGER NOT NULL DEFAULT 0,
    "slowRecoveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceCheckSubscriber_serviceCheckId_fkey" FOREIGN KEY ("serviceCheckId") REFERENCES "ServiceCheck" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServiceCheckSubscriber_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ServiceCheckSubscriber" ("createdAt", "id", "serviceCheckId", "userId") SELECT "createdAt", "id", "serviceCheckId", "userId" FROM "ServiceCheckSubscriber";
DROP TABLE "ServiceCheckSubscriber";
ALTER TABLE "new_ServiceCheckSubscriber" RENAME TO "ServiceCheckSubscriber";
CREATE UNIQUE INDEX "ServiceCheckSubscriber_serviceCheckId_userId_key" ON "ServiceCheckSubscriber"("serviceCheckId", "userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "DockerContainerState_serverId_idx" ON "DockerContainerState"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "DockerContainerState_serverId_containerId_key" ON "DockerContainerState"("serverId", "containerId");

