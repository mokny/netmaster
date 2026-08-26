import { NextResponse } from "next/server";
import { openSftpSessionAs } from "@/lib/ssh";
import { mkdir, assertNotExists } from "@/lib/sftp-ops";
import { requireFbContext, handleFbError } from "@/lib/filebrowser/route-helpers";
import { resolveVirtualPath, requireWritable, FbAccessError } from "@/lib/filebrowser/access";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const ctx = await requireFbContext(serverId);
    const body = await req.json().catch(() => null);
    const virtualPath = typeof body?.path === "string" ? body.path : "";
    if (!virtualPath) throw new FbAccessError(400, "INVALID_PATH");

    const resolved = resolveVirtualPath(ctx.shares, virtualPath);
    requireWritable(resolved);

    const { conn, sftp } = await openSftpSessionAs(ctx.server, ctx.username, ctx.password);
    try {
      await assertNotExists(sftp, resolved.absPath);
      await mkdir(sftp, resolved.absPath);
      return NextResponse.json({ ok: true });
    } finally {
      conn.end();
    }
  } catch (err) {
    return handleFbError(err);
  }
}
