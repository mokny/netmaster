-- CreateTable
CREATE TABLE "ProxmoxVm" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProxmoxVm_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProxmoxVmSample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vmId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cpuPercent" REAL,
    "memPercent" REAL,
    "diskPercent" REAL,
    CONSTRAINT "ProxmoxVmSample_vmId_fkey" FOREIGN KEY ("vmId") REFERENCES "ProxmoxVm" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ProxmoxVm_serverId_vmid_key" ON "ProxmoxVm"("serverId", "vmid");

-- CreateIndex
CREATE INDEX "ProxmoxVmSample_vmId_timestamp_idx" ON "ProxmoxVmSample"("vmId", "timestamp");
