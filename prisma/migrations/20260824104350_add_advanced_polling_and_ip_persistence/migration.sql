-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DockerContainerState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "running" BOOLEAN NOT NULL DEFAULT true,
    "stoppedSince" DATETIME,
    "ipsJson" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DockerContainerState_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DockerContainerState" ("containerId", "id", "name", "running", "serverId", "stoppedSince", "updatedAt") SELECT "containerId", "id", "name", "running", "serverId", "stoppedSince", "updatedAt" FROM "DockerContainerState";
DROP TABLE "DockerContainerState";
ALTER TABLE "new_DockerContainerState" RENAME TO "DockerContainerState";
CREATE INDEX "DockerContainerState_serverId_idx" ON "DockerContainerState"("serverId");
CREATE UNIQUE INDEX "DockerContainerState_serverId_containerId_key" ON "DockerContainerState"("serverId", "containerId");
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
    "advancedPollingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "advancedPollingIntervalSec" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PollingSettings" ("dashboardLookupsEnabled", "discoveryScanEnabled", "dockerContainersEnabled", "dockerImagesEnabled", "id", "pingEnabled", "pingIntervalSec", "portsEnabled", "proxmoxVmsEnabled", "routerDevicesEnabled", "serverMetricsEnabled", "topologyGraphEnabled", "updatedAt", "uptimeChecksEnabled", "wsProcessesEnabled") SELECT "dashboardLookupsEnabled", "discoveryScanEnabled", "dockerContainersEnabled", "dockerImagesEnabled", "id", "pingEnabled", "pingIntervalSec", "portsEnabled", "proxmoxVmsEnabled", "routerDevicesEnabled", "serverMetricsEnabled", "topologyGraphEnabled", "updatedAt", "uptimeChecksEnabled", "wsProcessesEnabled" FROM "PollingSettings";
DROP TABLE "PollingSettings";
ALTER TABLE "new_PollingSettings" RENAME TO "PollingSettings";
CREATE TABLE "new_ProxmoxVm" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "vmid" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "cpuPercent" REAL,
    "memUsedMb" REAL,
    "memTotalMb" REAL,
    "diskUsedGb" REAL,
    "diskTotalGb" REAL,
    "ipsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProxmoxVm_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProxmoxVm" ("cpuPercent", "createdAt", "diskTotalGb", "diskUsedGb", "id", "memTotalMb", "memUsedMb", "name", "serverId", "status", "type", "updatedAt", "vmid") SELECT "cpuPercent", "createdAt", "diskTotalGb", "diskUsedGb", "id", "memTotalMb", "memUsedMb", "name", "serverId", "status", "type", "updatedAt", "vmid" FROM "ProxmoxVm";
DROP TABLE "ProxmoxVm";
ALTER TABLE "new_ProxmoxVm" RENAME TO "ProxmoxVm";
CREATE UNIQUE INDEX "ProxmoxVm_serverId_vmid_key" ON "ProxmoxVm"("serverId", "vmid");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
