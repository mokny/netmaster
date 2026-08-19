-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Server" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "sshPort" INTEGER NOT NULL DEFAULT 22,
    "sshUsername" TEXT NOT NULL,
    "authType" TEXT NOT NULL DEFAULT 'PASSWORD',
    "encryptedSecret" TEXT NOT NULL,
    "pollIntervalSec" INTEGER NOT NULL DEFAULT 30,
    "retentionDays" INTEGER NOT NULL DEFAULT 30,
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

-- CreateTable
CREATE TABLE "MetricSample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cpuPercent" REAL,
    "memPercent" REAL,
    "diskPercent" REAL,
    "loadAvg1" REAL,
    "netRxBytes" REAL,
    "netTxBytes" REAL,
    CONSTRAINT "MetricSample_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "expectedStatus" INTEGER NOT NULL DEFAULT 200,
    "intervalSec" INTEGER NOT NULL DEFAULT 30,
    "timeoutMs" INTEGER NOT NULL DEFAULT 5000,
    "lastStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastLatencyMs" REAL,
    "lastCheckedAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceCheck_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceCheckResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceCheckId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL,
    "statusCode" INTEGER,
    "latencyMs" REAL,
    CONSTRAINT "ServiceCheckResult_serviceCheckId_fkey" FOREIGN KEY ("serviceCheckId") REFERENCES "ServiceCheck" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DockerContainerSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "containerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "cpuPercent" REAL,
    "memUsageMb" REAL,
    CONSTRAINT "DockerContainerSnapshot_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DashboardLayout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "layoutJson" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DashboardLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "MetricSample_serverId_timestamp_idx" ON "MetricSample"("serverId", "timestamp");

-- CreateIndex
CREATE INDEX "ServiceCheckResult_serviceCheckId_timestamp_idx" ON "ServiceCheckResult"("serviceCheckId", "timestamp");

-- CreateIndex
CREATE INDEX "DockerContainerSnapshot_serverId_timestamp_idx" ON "DockerContainerSnapshot"("serverId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardLayout_userId_key" ON "DashboardLayout"("userId");
