-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DiscoveredHost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ip" TEXT NOT NULL,
    "mac" TEXT,
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
INSERT INTO "new_DiscoveredHost" ("firstSeenAt", "hostname", "id", "ip", "lastSeenAt", "lastSeenOnline", "mac", "openPortsJson", "osGuess", "rangeId", "vendor") SELECT "firstSeenAt", "hostname", "id", "ip", "lastSeenAt", "lastSeenOnline", "mac", "openPortsJson", "osGuess", "rangeId", "vendor" FROM "DiscoveredHost";
DROP TABLE "DiscoveredHost";
ALTER TABLE "new_DiscoveredHost" RENAME TO "DiscoveredHost";
CREATE UNIQUE INDEX "DiscoveredHost_mac_key" ON "DiscoveredHost"("mac");
CREATE INDEX "DiscoveredHost_ip_idx" ON "DiscoveredHost"("ip");
CREATE INDEX "DiscoveredHost_rangeId_idx" ON "DiscoveredHost"("rangeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
