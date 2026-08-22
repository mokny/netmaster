-- CreateTable
CREATE TABLE "PollingSettings" (
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
    "updatedAt" DATETIME NOT NULL
);
