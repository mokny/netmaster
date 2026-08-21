/*
  Warnings:

  - You are about to drop the column `scanRangeOverride` on the `ExploreSettings` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "ExploreRange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cidr" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "interfaceName" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Bestehenden manuellen scanRangeOverride als MANUAL-Range übernehmen, bevor
-- die Spalte weiter unten mit der ExploreSettings-Tabelle entfällt.
INSERT INTO "ExploreRange" ("id", "cidr", "source", "interfaceName", "enabled", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), "scanRangeOverride", 'MANUAL', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ExploreSettings"
WHERE "scanRangeOverride" IS NOT NULL AND "scanRangeOverride" != '';

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DiscoveredHost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ip" TEXT NOT NULL,
    "mac" TEXT NOT NULL,
    "hostname" TEXT,
    "vendor" TEXT,
    "openPortsJson" TEXT NOT NULL DEFAULT '[]',
    "osGuess" TEXT,
    "lastSeenOnline" BOOLEAN NOT NULL DEFAULT true,
    "rangeId" TEXT,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscoveredHost_rangeId_fkey" FOREIGN KEY ("rangeId") REFERENCES "ExploreRange" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DiscoveredHost" ("firstSeenAt", "hostname", "id", "ip", "lastSeenAt", "lastSeenOnline", "mac", "openPortsJson", "osGuess", "vendor") SELECT "firstSeenAt", "hostname", "id", "ip", "lastSeenAt", "lastSeenOnline", "mac", "openPortsJson", "osGuess", "vendor" FROM "DiscoveredHost";
DROP TABLE "DiscoveredHost";
ALTER TABLE "new_DiscoveredHost" RENAME TO "DiscoveredHost";
CREATE UNIQUE INDEX "DiscoveredHost_mac_key" ON "DiscoveredHost"("mac");
CREATE INDEX "DiscoveredHost_ip_idx" ON "DiscoveredHost"("ip");
CREATE INDEX "DiscoveredHost_rangeId_idx" ON "DiscoveredHost"("rangeId");
CREATE TABLE "new_ExploreSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "autoScanEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoScanIntervalHr" INTEGER NOT NULL DEFAULT 24,
    "portScanConcurrency" INTEGER NOT NULL DEFAULT 5,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ExploreSettings" ("autoScanEnabled", "autoScanIntervalHr", "id", "updatedAt") SELECT "autoScanEnabled", "autoScanIntervalHr", "id", "updatedAt" FROM "ExploreSettings";
DROP TABLE "ExploreSettings";
ALTER TABLE "new_ExploreSettings" RENAME TO "ExploreSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ExploreRange_source_interfaceName_key" ON "ExploreRange"("source", "interfaceName");
