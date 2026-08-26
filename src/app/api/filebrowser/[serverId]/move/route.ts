import { NextResponse } from "next/server";
import { openSftpSessionAs } from "@/lib/ssh";
import { movePath } from "@/lib/sftp-ops";
import { requireFbContext, handleFbError } from "@/lib/filebrowser/route-helpers";
import { resolveVirtualPath, requireWritable, requireNotShareRoot, FbAccessError } from "@/lib/filebrowser/access";
import { resolveDestination, type ConflictMode } from "@/lib/filebrowser/conflict";

// `to` ist der vollständige virtuelle Zielpfad INKLUSIVE Namen (vom Client
// aus Zielordner + Basisname zusammengesetzt), analog zu `from`.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const ctx = await requireFbContext(serverId);
    const body = await req.json().catch(() => null);
    const from = typeof body?.from === "string" ? body.from : "";
    const to = typeof body?.to === "string" ? body.to : "";
    const conflict: ConflictMode = body?.conflict === "overwrite" || body?.conflict === "rename" ? body.conflict : undefined;
    if (!from || !to) throw new FbAccessError(400, "INVALID_PATH");

    const fromResolved = resolveVirtualPath(ctx.shares, from);
    const toResolved = resolveVirtualPath(ctx.shares, to);
    requireWritable(fromResolved);
    requireWritable(toResolved);
    requireNotShareRoot(fromResolved);

    const { conn, sftp } = await openSftpSessionAs(ctx.server, ctx.username, ctx.password);
    try {
      const destPath = await resolveDestination(sftp, toResolved.absPath, conflict);
      await movePath(sftp, fromResolved.absPath, destPath);
      return NextResponse.json({ ok: true });
    } finally {
      conn.end();
    }
  } catch (err) {
    return handleFbError(err);
  }
}
