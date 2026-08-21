-- CreateTable
CREATE TABLE "RouterSample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "routerDeviceId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bytesReceived" REAL,
    "bytesSent" REAL,
    CONSTRAINT "RouterSample_routerDeviceId_fkey" FOREIGN KEY ("routerDeviceId") REFERENCES "RouterDevice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RouterSample_routerDeviceId_timestamp_idx" ON "RouterSample"("routerDeviceId", "timestamp");
