import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import {
  collectServerMetrics,
  collectDockerContainers,
  collectProxmoxVms,
  runServiceCheck,
} from "@/lib/monitor/collect";
import type { PredefinedAction } from "@/generated/prisma/client";

// Feste Aufbewahrungsfristen für CLEANUP_LOGS - unabhängig von
// Server.retentionDays, das bereits automatisch bei jedem Poll ausgewertet
// wird (siehe collect.ts). Hier geht es um Tabellen ohne automatische
// Bereinigung.
const AUDIT_LOG_RETENTION_DAYS = 90;
const JOB_RUN_RETENTION_DAYS = 30;

async function runReconcileNow(): Promise<string> {
  const servers = await prisma.server.findMany();
  await Promise.all(
    servers.map(async (server) => {
      await collectServerMetrics(server);
      if (server.dockerEnabled) await collectDockerContainers(server, "on_demand");
      if (server.proxmoxEnabled) await collectProxmoxVms(server, "on_demand");
    })
  );
  return `Reconciled ${servers.length} server(s)`;
}

async function runCleanupLogs(): Promise<string> {
  const auditCutoff = new Date(Date.now() - AUDIT_LOG_RETENTION_DAYS * 86_400_000);
  const jobRunCutoff = new Date(Date.now() - JOB_RUN_RETENTION_DAYS * 86_400_000);
  const [audit, runs] = await Promise.all([
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: auditCutoff } } }),
    prisma.jobRun.deleteMany({ where: { startedAt: { lt: jobRunCutoff } } }),
  ]);
  return `Deleted ${audit.count} audit log(s) and ${runs.count} job run(s)`;
}

// Erstellt eine konsistente Kopie der SQLite-Datenbank per 'VACUUM INTO' (im
// Gegensatz zu einer rohen Dateikopie sicher auch bei parallelen Schreibern)
// unter <db-dir>/backups.
async function runDbBackup(): Promise<string> {
  const dbUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const dbPath = path.resolve(dbUrl.replace(/^file:/, ""));
  const backupDir = path.join(path.dirname(dbPath), "backups");
  await fs.mkdir(backupDir, { recursive: true });
  const filename = `netmaster-${new Date().toISOString().replace(/[:.]/g, "-")}.db`;
  const backupPath = path.join(backupDir, filename);
  await prisma.$executeRawUnsafe(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  return `Backup written to ${backupPath}`;
}

async function runAllServiceChecks(): Promise<string> {
  const checks = await prisma.serviceCheck.findMany();
  await Promise.all(checks.map((check) => runServiceCheck(check)));
  return `Ran ${checks.length} service check(s)`;
}

const PREDEFINED_ACTIONS: Record<PredefinedAction, () => Promise<string>> = {
  RECONCILE_NOW: runReconcileNow,
  CLEANUP_LOGS: runCleanupLogs,
  DB_BACKUP: runDbBackup,
  RUN_SERVICE_CHECKS: runAllServiceChecks,
};

export function runPredefinedAction(action: PredefinedAction): Promise<string> {
  return PREDEFINED_ACTIONS[action]();
}
