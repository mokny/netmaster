-- CreateTable
CREATE TABLE "RouterDevice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 49000,
    "useTls" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT NOT NULL,
    "encryptedPassword" TEXT NOT NULL,
    "pollIntervalSec" INTEGER NOT NULL DEFAULT 60,
    "lastStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastError" TEXT,
    "lastCheckedAt" DATETIME,
    "modelName" TEXT,
    "firmwareVersion" TEXT,
    "uptimeSec" INTEGER,
    "wanConnectionStatus" TEXT,
    "wanExternalIp" TEXT,
    "connectedHostsJson" TEXT NOT NULL DEFAULT '[]',
    "wifiNetworksJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
