-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PollingSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverMetricsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dockerContainersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dockerImagesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "proxmoxVmsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "routerDevicesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "uptimeChecksEnabled" BOOLEAN NOT NULL DEFAULT true,
    "discoveryScanEnabled" BOOLEAN NOT NULL DEFAULT true,
    "topologyGraphEnabled" BOOLEAN NOT NULL DEFAULT true,
    "portsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dashboardLookupsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "wsProcessesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pingIntervalSec" INTEGER NOT NULL DEFAULT 15,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PollingSettings" ("dashboardLookupsEnabled", "discoveryScanEnabled", "dockerContainersEnabled", "dockerImagesEnabled", "id", "portsEnabled", "proxmoxVmsEnabled", "routerDevicesEnabled", "serverMetricsEnabled", "topologyGraphEnabled", "updatedAt", "uptimeChecksEnabled", "wsProcessesEnabled") SELECT "dashboardLookupsEnabled", "discoveryScanEnabled", "dockerContainersEnabled", "dockerImagesEnabled", "id", "portsEnabled", "proxmoxVmsEnabled", "routerDevicesEnabled", "serverMetricsEnabled", "topologyGraphEnabled", "updatedAt", "uptimeChecksEnabled", "wsProcessesEnabled" FROM "PollingSettings";
DROP TABLE "PollingSettings";
ALTER TABLE "new_PollingSettings" RENAME TO "PollingSettings";
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
    "vmDockerPollIntervalSec" INTEGER NOT NULL DEFAULT 7200,
    "retentionDays" INTEGER NOT NULL DEFAULT 30,
    "dockerEnabled" BOOLEAN NOT NULL DEFAULT true,
    "proxmoxEnabled" BOOLEAN NOT NULL DEFAULT true,
    "networkToolsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "wireguardEnabled" BOOLEAN NOT NULL DEFAULT false,
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
    "offlineSince" DATETIME,
    "cpuWarnSince" DATETIME,
    "cpuCritSince" DATETIME,
    "memWarnSince" DATETIME,
    "memCritSince" DATETIME,
    "diskWarnSince" DATETIME,
    "diskCritSince" DATETIME,
    "netWarnSince" DATETIME,
    "netCritSince" DATETIME,
    "cpuCores" INTEGER,
    "memTotalMb" REAL,
    "osName" TEXT,
    "kernelVersion" TEXT,
    "bootedAt" DATETIME
);
INSERT INTO "new_Server" ("authType", "bootedAt", "cpuCores", "cpuCrit", "cpuCritSince", "cpuWarn", "cpuWarnSince", "createdAt", "description", "diskCrit", "diskCritSince", "diskWarn", "diskWarnSince", "dockerEnabled", "encryptedPassphrase", "encryptedSecret", "encryptedSudoPassword", "hostname", "id", "kernelVersion", "lastCheckedAt", "lastCpuStatus", "lastDiskStatus", "lastError", "lastMemStatus", "lastNetStatus", "lastStatus", "memCrit", "memCritSince", "memTotalMb", "memWarn", "memWarnSince", "name", "netCritSince", "netDownloadCrit", "netDownloadWarn", "netUploadCrit", "netUploadWarn", "netWarnSince", "networkToolsEnabled", "offlineSince", "osName", "pollIntervalSec", "proxmoxEnabled", "retentionDays", "sshPort", "sshUsername", "tags", "updatedAt", "wireguardEnabled") SELECT "authType", "bootedAt", "cpuCores", "cpuCrit", "cpuCritSince", "cpuWarn", "cpuWarnSince", "createdAt", "description", "diskCrit", "diskCritSince", "diskWarn", "diskWarnSince", "dockerEnabled", "encryptedPassphrase", "encryptedSecret", "encryptedSudoPassword", "hostname", "id", "kernelVersion", "lastCheckedAt", "lastCpuStatus", "lastDiskStatus", "lastError", "lastMemStatus", "lastNetStatus", "lastStatus", "memCrit", "memCritSince", "memTotalMb", "memWarn", "memWarnSince", "name", "netCritSince", "netDownloadCrit", "netDownloadWarn", "netUploadCrit", "netUploadWarn", "netWarnSince", "networkToolsEnabled", "offlineSince", "osName", "pollIntervalSec", "proxmoxEnabled", "retentionDays", "sshPort", "sshUsername", "tags", "updatedAt", "wireguardEnabled" FROM "Server";
DROP TABLE "Server";
ALTER TABLE "new_Server" RENAME TO "Server";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
