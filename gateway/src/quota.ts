import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.js";
import { fetchShares, reportUsage } from "./main-api-client.js";
import { mountPointFor, reportMountIoError, isDeadMountError } from "./mounts.js";

const execFileAsync = promisify(execFile);

async function measureUsage(shareId: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("du", ["-sb", mountPointFor(shareId)]);
    const bytes = Number(stdout.split("\t")[0]);
    return Number.isFinite(bytes) ? bytes : null;
  } catch (err) {
    if (isDeadMountError(err)) reportMountIoError(shareId);
    console.error(`Quota-Check für Freigabe ${shareId} fehlgeschlagen:`, err);
    return null;
  }
}

export async function checkAllQuotas(): Promise<void> {
  const shares = await fetchShares().catch(() => []);
  for (const share of shares) {
    const usedBytes = await measureUsage(share.id);
    if (usedBytes === null) continue;
    await reportUsage(share.id, usedBytes).catch((err) =>
      console.error(`Konnte Nutzung für Freigabe ${share.id} nicht melden:`, err)
    );
  }
}

export function startQuotaChecker(): void {
  checkAllQuotas();
  setInterval(checkAllQuotas, config.quotaCheckIntervalMs);
}
