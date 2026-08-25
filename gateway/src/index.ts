import fs from "node:fs";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.js";
import { startMountManager } from "./mounts.js";
import { startFilesApiServer } from "./files-api.js";
import { startFtpServers } from "./ftp-server.js";
import { startSftpServer } from "./sftp-server.js";
import { startSambaSync } from "./samba.js";
import { startQuotaChecker } from "./quota.js";

const execFileAsync = promisify(execFile);

async function ensureSftpHostKey(): Promise<void> {
  if (fs.existsSync(config.sftpHostKeyPath)) return;
  await fs.promises.mkdir(path.dirname(config.sftpHostKeyPath), { recursive: true });
  await execFileAsync("ssh-keygen", ["-t", "ed25519", "-f", config.sftpHostKeyPath, "-N", ""]);
}

// smbd läuft in diesem Container ohne Init-System/systemd - hier als
// Kindprozess im Vordergrund-Modus gestartet, damit `smbcontrol` (in
// samba.ts) danach mit ihm sprechen kann.
function startSmbd(): void {
  const smbd = spawn("smbd", ["--foreground", "--no-process-group"], { stdio: "inherit" });
  smbd.on("exit", (code) => {
    console.error(`smbd wurde beendet (Code ${code}) - Samba-Zugriff ist bis zum Neustart nicht verfügbar.`);
  });
}

async function main() {
  await fs.promises.mkdir(config.mountRoot, { recursive: true });
  await ensureSftpHostKey();

  startSmbd();
  startMountManager();
  startFilesApiServer();
  startFtpServers();
  startSftpServer();
  startSambaSync(5 * 60_000);
  startQuotaChecker();

  console.log("NetMaster NAS-Gateway gestartet.");
}

main().catch((err) => {
  console.error("NAS-Gateway konnte nicht gestartet werden:", err);
  process.exit(1);
});
