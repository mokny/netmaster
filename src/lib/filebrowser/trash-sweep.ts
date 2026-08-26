import { prisma } from "@/lib/prisma";
import { listShares } from "@/lib/storage/samba";
import { tryRootScript } from "@/lib/storage/exec";
import { parseTrashEntryName, TRASH_DIR_NAME } from "./trash";

// Endgültige Löschung von Papierkorb-Einträgen läuft absichtlich NICHT über
// SFTP als der jeweilige Samba-User (bräuchte pro User eine eigene Session
// für einen reinen Wartungsjob), sondern als Admin/root per SSH-Skript -
// das ist ein Wartungslauf, keine Nutzeraktion, OS-Rechte sind hier egal.
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export async function sweepAllServersTrash(): Promise<void> {
  const rows = await prisma.sambaWebUser.findMany({
    where: { webUiEnabled: true },
    select: { serverId: true },
    distinct: ["serverId"],
  });

  for (const { serverId } of rows) {
    try {
      await sweepServerTrash(serverId);
    } catch (err) {
      // Ein kaputter Server darf den Sweep für alle anderen nicht abbrechen.
      console.error(`Filebrowser-Papierkorb-Sweep fehlgeschlagen (Server ${serverId}):`, err);
    }
  }
}

async function sweepServerTrash(serverId: string): Promise<void> {
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) return;

  const shares = await listShares(server);
  const cutoff = Date.now() - RETENTION_MS;

  for (const share of shares) {
    const trashDir = `${share.path.replace(/\/+$/, "")}/${TRASH_DIR_NAME}`;
    const listScript = `ls -1a -- ${JSON.stringify(trashDir)} 2>/dev/null | grep -vE '^\\.\\.?$'`;
    const listResult = await tryRootScript(server, listScript);
    if (listResult.code !== 0) continue; // .trash existiert (noch) nicht o.ä. - nichts zu tun

    const names = listResult.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const stale = names.filter((name) => {
      const parsed = parseTrashEntryName(name);
      return parsed !== null && parsed.epochMillis < cutoff;
    });
    if (stale.length === 0) continue;

    const rmScript = stale
      .map((name) => `rm -rf -- ${JSON.stringify(`${trashDir}/${name}`)}`)
      .join("\n");
    await tryRootScript(server, rmScript);
  }
}
