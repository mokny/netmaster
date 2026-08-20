-- AlterTable
ALTER TABLE "MetricSample" ADD COLUMN "loadAvg15" REAL;
ALTER TABLE "MetricSample" ADD COLUMN "loadAvg5" REAL;

-- AlterTable
ALTER TABLE "Server" ADD COLUMN "bootedAt" DATETIME;
ALTER TABLE "Server" ADD COLUMN "cpuCores" INTEGER;
ALTER TABLE "Server" ADD COLUMN "kernelVersion" TEXT;
ALTER TABLE "Server" ADD COLUMN "memTotalMb" REAL;
ALTER TABLE "Server" ADD COLUMN "osName" TEXT;
