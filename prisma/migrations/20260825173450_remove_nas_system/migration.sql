/*
  Warnings:

  - You are about to drop the `NasAuditLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `NasGatewaySettings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `NasSession` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `NasShare` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `NasShareLink` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `NasShareMember` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `NasUser` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "NasAuditLog";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "NasGatewaySettings";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "NasSession";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "NasShare";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "NasShareLink";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "NasShareMember";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "NasUser";
PRAGMA foreign_keys=on;
