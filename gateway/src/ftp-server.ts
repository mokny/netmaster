import fs from "node:fs/promises";
import path from "node:path";
import { FtpSrv } from "ftp-srv";
import { config } from "./config.js";
import { authenticateNasUser } from "./main-api-client.js";
import { mountPointFor } from "./mounts.js";

const VIRTUAL_ROOT_BASE = "/tmp/netmaster-nas-ftp-roots";

// FTP (anders als die Datei-API/SFTP) serviert pro Session eine einzelne
// Root-Directory. Um mehrere Freigaben pro NAS-User trotzdem zugänglich zu
// machen, bauen wir einen virtuellen Root-Ordner mit einem Symlink je
// Freigabe auf - Ownership/Schreibrechte laufen dadurch über das reale
// Dateisystem (Mountpoint), nicht über eine Custom-VFS-Schicht. Achtung:
// das bedeutet, die pro-Freigabe READ_ONLY-Rolle wird hier (noch) nicht
// erzwungen wie im Web-UI/Datei-API-Proxy - siehe Plan-Notiz zum Nachrüsten
// einer echten Custom-Filesystem-Implementierung für granulare FTP-Rechte.
async function buildVirtualRoot(
  nasUserId: string,
  shares: { shareId: string; role: string }[]
): Promise<string> {
  const root = path.join(VIRTUAL_ROOT_BASE, nasUserId);
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(root, { recursive: true });
  for (const share of shares) {
    const linkPath = path.join(root, share.shareId);
    await fs.symlink(mountPointFor(share.shareId), linkPath).catch(() => {});
  }
  return root;
}

export function startFtpServers(): void {
  if (config.ftpEnabled) {
    startOne({ port: config.ftpPort, tls: false });
  }
  if (config.ftpsEnabled) {
    startOne({ port: config.ftpsPort, tls: true });
  }
}

function startOne({ port, tls }: { port: number; tls: boolean }): void {
  const url = `${tls ? "ftps" : "ftp"}://0.0.0.0:${port}`;
  const ftpServer = new FtpSrv({
    url,
    pasv_url: config.ftpPasvUrl,
    anonymous: false,
    tls: tls ? { key: config.ftpTlsKeyPath, cert: config.ftpTlsCertPath } : undefined,
  });

  ftpServer.on("login", async ({ username, password }, resolve, reject) => {
    try {
      const result = await authenticateNasUser(username, password);
      if (!result.ok || !result.nasUserId || !result.shares) {
        reject(new Error("Invalid credentials"));
        return;
      }
      const root = await buildVirtualRoot(result.nasUserId, result.shares);
      resolve({ root });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });

  ftpServer.listen().then(() => {
    console.log(`NAS-Gateway ${tls ? "FTPS" : "FTP"}-Server hört auf Port ${port}`);
  });
}
