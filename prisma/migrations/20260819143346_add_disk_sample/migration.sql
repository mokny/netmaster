-- CreateTable
CREATE TABLE "DiskSample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mountpoint" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "totalKb" REAL,
    "usedKb" REAL,
    "percent" REAL,
    CONSTRAINT "DiskSample_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DiskSample_serverId_mountpoint_timestamp_idx" ON "DiskSample"("serverId", "mountpoint", "timestamp");
