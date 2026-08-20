-- CreateTable
CREATE TABLE "DiscoveredHost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ip" TEXT NOT NULL,
    "mac" TEXT NOT NULL,
    "hostname" TEXT,
    "vendor" TEXT,
    "openPortsJson" TEXT NOT NULL DEFAULT '[]',
    "osGuess" TEXT,
    "lastSeenOnline" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ExploreSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scanRangeOverride" TEXT,
    "autoScanEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoScanIntervalHr" INTEGER NOT NULL DEFAULT 24,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveredHost_mac_key" ON "DiscoveredHost"("mac");

-- CreateIndex
CREATE INDEX "DiscoveredHost_ip_idx" ON "DiscoveredHost"("ip");
