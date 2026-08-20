-- CreateTable
CREATE TABLE "ServiceCheckSubscriber" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceCheckId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceCheckSubscriber_serviceCheckId_fkey" FOREIGN KEY ("serviceCheckId") REFERENCES "ServiceCheck" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServiceCheckSubscriber_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ServiceCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT,
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
INSERT INTO "new_ServiceCheck" ("createdAt", "expectedStatus", "id", "intervalSec", "lastCheckedAt", "lastError", "lastLatencyMs", "lastStatus", "name", "serverId", "timeoutMs", "url") SELECT "createdAt", "expectedStatus", "id", "intervalSec", "lastCheckedAt", "lastError", "lastLatencyMs", "lastStatus", "name", "serverId", "timeoutMs", "url" FROM "ServiceCheck";
DROP TABLE "ServiceCheck";
ALTER TABLE "new_ServiceCheck" RENAME TO "ServiceCheck";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCheckSubscriber_serviceCheckId_userId_key" ON "ServiceCheckSubscriber"("serviceCheckId", "userId");
