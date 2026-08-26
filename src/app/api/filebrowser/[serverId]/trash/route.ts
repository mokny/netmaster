import path from "node:path";
import { NextResponse } from "next/server";
import { openSftpSessionAs } from "@/lib/ssh";
import { listDir } from "@/lib/sftp-ops";
import { requireFbContext, handleFbError } from "@/lib/filebrowser/route-helpers";
import { parseTrashEntryName, TRASH_DIR_NAME } from "@/lib/filebrowser/trash";

// Zusammengeführte Papierkorb-Ansicht über alle erlaubten Freigaben des
// eingeloggten Users hinweg - jeder Eintrag trägt zusätzlich an, aus welcher
// Freigabe er stammt (nötig für restore/empty).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const ctx = await requireFbContext(serverId);

    const { conn, sftp } = await openSftpSessionAs(ctx.server, ctx.username, ctx.password);
    try {
      const items: {
        share: string;
        entryName: string;
        originalRelPath: string;
        deletedAt: number;
        isDirectory: boolean;
        size: number;
      }[] = [];

      for (const share of ctx.shares) {
        if (!share.writable) continue; // nur Freigaben, in denen der User löschen darf, haben je Papierkorb-Inhalt von ihm
        const trashDir = path.posix.join(share.path, TRASH_DIR_NAME);
        let nodes;
        try {
          nodes = await listDir(sftp, trashDir);
        } catch {
          continue; // noch kein .trash-Verzeichnis vorhanden
        }
        for (const node of nodes) {
          const parsed = parseTrashEntryName(node.name);
          if (!parsed) continue;
          items.push({
            share: share.name,
            entryName: node.name,
            originalRelPath: parsed.originalRelPath,
            deletedAt: parsed.epochMillis,
            isDirectory: node.isDirectory,
            size: node.size,
          });
        }
      }

      items.sort((a, b) => b.deletedAt - a.deletedAt);
      return NextResponse.json({ items });
    } finally {
      conn.end();
    }
  } catch (err) {
    return handleFbError(err);
  }
}
