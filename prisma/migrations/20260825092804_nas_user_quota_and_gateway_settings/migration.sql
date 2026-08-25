-- AlterTable
ALTER TABLE "NasUser" ADD COLUMN "quotaBytes" BIGINT;

-- CreateTable
CREATE TABLE "NasGatewaySettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicHost" TEXT NOT NULL DEFAULT '',
    "ftpEnabled" BOOLEAN NOT NULL DEFAULT true,
    "ftpPort" INTEGER NOT NULL DEFAULT 21,
    "ftpsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ftpsPort" INTEGER NOT NULL DEFAULT 990,
    "sftpPort" INTEGER NOT NULL DEFAULT 2222,
    "updatedAt" DATETIME NOT NULL
);
