import path from "node:path";
import { NextResponse } from "next/server";
import { openSftpSessionAs } from "@/lib/ssh";
import { mkdirRecursive, movePath } from "@/lib/sftp-ops";
import { requireFbContext, handleFbError } from "@/lib/filebrowser/route-helpers";
import { FbAccessError } from "@/lib/filebrowser/access";
import { parseTrashEntryName, TRASH_DIR_NAME } from "@/lib/filebrowser/trash";
import { resolveDestination, type ConflictMode } from "@/lib/filebrowser/conflict";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const ctx = await requireFbContext(serverId);
    const body = await req.json().catch(() => null);
    const shareName = typeof body?.share === "string" ? body.share : "";
    const entryName = typeof body?.entryName === "string" ? body.entryName : "";
    const conflict: ConflictMode = body?.conflict === "overwrite" || body?.conflict === "rename" ? body.conflict : undefined;
    if (!shareName || !entryName) throw new FbAccessError(400, "INVALID_PATH");

    const share = ctx.shares.find((s) => s.name === shareName);
    if (!share) throw new FbAccessError(403, "SHARE_NOT_PERMITTED");
    if (!share.writable) throw new FbAccessError(403, "READ_ONLY_SHARE");

    const parsed = parseTrashEntryName(entryName);
    if (!parsed) throw new FbAccessError(400, "INVALID_TRASH_ENTRY");

    const trashDir = path.posix.join(share.path, TRASH_DIR_NAME);
    const srcPath = path.posix.join(trashDir, entryName);
    const destPath = path.posix.join(share.path, parsed.originalRelPath);

    const { conn, sftp } = await openSftpSessionAs(ctx.server, ctx.username, ctx.password);
    try {
      await mkdirRecursive(sftp, path.posix.dirname(destPath));
      const finalDest = await resolveDestination(sftp, destPath, conflict);
      await movePath(sftp, srcPath, finalDest);
      return NextResponse.json({ ok: true, path: finalDest });
    } finally {
      conn.end();
    }
  } catch (err) {
    return handleFbError(err);
  }
}
