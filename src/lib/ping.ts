import { execFile } from "node:child_process";

export interface PingResult {
  success: boolean;
  latencyMs: number | null;
  error: string | null;
}

const LATENCY_PATTERN = /time[=<]([\d.]+)/i;

// Führt einen einzelnen ICMP-Ping über das System-`ping`-Binär aus (kein
// Node-Raw-Socket - der Container braucht dafür kein CAP_NET_RAW extra,
// solange das ping-Binär selbst die nötigen Rechte hat). execFile statt
// exec, da der Host aus Nutzereingaben stammt und nicht durch eine Shell
// laufen darf.
export function runPingCheck(host: string, timeoutMs: number): Promise<PingResult> {
  const timeoutSec = Math.max(1, Math.round(timeoutMs / 1000));
  return new Promise((resolve) => {
    execFile(
      "ping",
      ["-c", "1", "-W", String(timeoutSec), host],
      { timeout: timeoutMs + 2000 },
      (err, stdout) => {
        if (err) {
          resolve({ success: false, latencyMs: null, error: err.message });
          return;
        }
        const match = LATENCY_PATTERN.exec(stdout);
        resolve({
          success: true,
          latencyMs: match ? Math.round(parseFloat(match[1])) : null,
          error: null,
        });
      }
    );
  });
}
