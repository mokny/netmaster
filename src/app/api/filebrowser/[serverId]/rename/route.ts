import path from "node:path";
import { NextResponse } from "next/server";
import { openSftpSessionAs } from "@/lib/ssh";
import { renamePath } from "@/lib/sftp-ops";
import { requireFbContext, handleFbError } from "@/lib/filebrowser/route-helpers";
import { resolveVirtualPath, requireWritable, requireNotShareRoot, FbAccessError } from "@/lib/filebrowser/access";
import { resolveDestination, type ConflictMode } from "@/lib/filebrowser/conflict";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const ctx = await requireFbContext(serverId);
    const body = await req.json().catch(() => null);
    const virtualPath = typeof body?.path === "string" ? body.path : "";
    const newName = typeof body?.newName === "string" ? body.newName.trim() : "";
    const conflict: ConflictMode = body?.conflict === "overwrite" || body?.conflict === "rename" ? body.conflict : undefined;
    if (!virtualPath || !newName || newName.includes("/") || newName === "." || newName === "..") {
      throw new FbAccessError(400, "INVALID_NAME");
    }

    const resolved = resolveVirtualPath(ctx.shares, virtualPath);
    requireWritable(resolved);
    requireNotShareRoot(resolved);

    const { conn, sftp } = await openSftpSessionAs(ctx.server, ctx.username, ctx.password);
    try {
      const newAbsPath = path.posix.join(path.posix.dirname(resolved.absPath), newName);
      const destPath = await resolveDestination(sftp, newAbsPath, conflict);
      await renamePath(sftp, resolved.absPath, destPath);
      return NextResponse.json({ ok: true, path: destPath });
    } finally {
      conn.end();
    }
  } catch (err) {
    return handleFbError(err);
  }
}
