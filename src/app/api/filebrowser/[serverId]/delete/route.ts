import path from "node:path";
import { NextResponse } from "next/server";
import { openSftpSessionAs } from "@/lib/ssh";
import { mkdirRecursive, movePath } from "@/lib/sftp-ops";
import { requireFbContext, handleFbError } from "@/lib/filebrowser/route-helpers";
import { resolveVirtualPath, requireWritable, requireNotShareRoot, FbAccessError } from "@/lib/filebrowser/access";
import { trashEntryName, TRASH_DIR_NAME } from "@/lib/filebrowser/trash";

// Soft-Delete: verschiebt jedes ausgewählte Element in ein verstecktes
// ".trash"-Verzeichnis INNERHALB derselben Freigabe (siehe lib/filebrowser/trash.ts).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const ctx = await requireFbContext(serverId);
    const body = await req.json().catch(() => null);
    const paths = Array.isArray(body?.paths) ? body.paths.filter((p: unknown) => typeof p === "string") : [];
    if (paths.length === 0) throw new FbAccessError(400, "INVALID_PATH");

    const resolvedItems = paths.map((p: string) => {
      const resolved = resolveVirtualPath(ctx.shares, p);
      requireWritable(resolved);
      requireNotShareRoot(resolved);
      return resolved;
    });

    const { conn, sftp } = await openSftpSessionAs(ctx.server, ctx.username, ctx.password);
    try {
      const trashedFor = new Set<string>();
      for (const item of resolvedItems) {
        const trashDir = path.posix.join(item.share.path, TRASH_DIR_NAME);
        if (!trashedFor.has(item.share.name)) {
          await mkdirRecursive(sftp, trashDir);
          trashedFor.add(item.share.name);
        }
        const entryName = trashEntryName(item.relPath);
        const destPath = path.posix.join(trashDir, entryName);
        await movePath(sftp, item.absPath, destPath);
      }
      return NextResponse.json({ ok: true, count: resolvedItems.length });
    } finally {
      conn.end();
    }
  } catch (err) {
    return handleFbError(err);
  }
}
