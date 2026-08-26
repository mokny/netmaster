import path from "node:path";
import { NextResponse } from "next/server";
import { openSftpSessionAs } from "@/lib/ssh";
import { listDir, removeRecursive } from "@/lib/sftp-ops";
import { requireFbContext, handleFbError } from "@/lib/filebrowser/route-helpers";
import { TRASH_DIR_NAME } from "@/lib/filebrowser/trash";

// Manuelles, permanentes Leeren - entweder einer einzelnen Freigabe (share im
// Body) oder aller beschreibbaren Freigaben des Users auf einmal.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const ctx = await requireFbContext(serverId);
    const body = await req.json().catch(() => ({}));
    const shareName = typeof body?.share === "string" ? body.share : null;

    const targets = shareName
      ? ctx.shares.filter((s) => s.name === shareName && s.writable)
      : ctx.shares.filter((s) => s.writable);

    const { conn, sftp } = await openSftpSessionAs(ctx.server, ctx.username, ctx.password);
    let removed = 0;
    try {
      for (const share of targets) {
        const trashDir = path.posix.join(share.path, TRASH_DIR_NAME);
        let nodes;
        try {
          nodes = await listDir(sftp, trashDir);
        } catch {
          continue;
        }
        for (const node of nodes) {
          await removeRecursive(sftp, node.path);
          removed += 1;
        }
      }
      return NextResponse.json({ ok: true, removed });
    } finally {
      conn.end();
    }
  } catch (err) {
    return handleFbError(err);
  }
}
