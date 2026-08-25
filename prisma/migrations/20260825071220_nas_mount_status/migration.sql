-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NasShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "remotePath" TEXT NOT NULL,
    "mountTransport" TEXT NOT NULL DEFAULT 'SSHFS',
    "quotaBytes" BIGINT,
    "usedBytes" BIGINT NOT NULL DEFAULT 0,
    "lastUsageCheckAt" DATETIME,
    "readOnlyLocked" BOOLEAN NOT NULL DEFAULT false,
    "mountActive" BOOLEAN NOT NULL DEFAULT false,
    "mountError" TEXT,
    "mountedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NasShare_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NasShare" ("createdAt", "id", "lastUsageCheckAt", "mountTransport", "name", "quotaBytes", "readOnlyLocked", "remotePath", "serverId", "updatedAt", "usedBytes") SELECT "createdAt", "id", "lastUsageCheckAt", "mountTransport", "name", "quotaBytes", "readOnlyLocked", "remotePath", "serverId", "updatedAt", "usedBytes" FROM "NasShare";
DROP TABLE "NasShare";
ALTER TABLE "new_NasShare" RENAME TO "NasShare";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
