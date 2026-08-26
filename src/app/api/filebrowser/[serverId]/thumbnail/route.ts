import { openSftpSessionAs } from "@/lib/ssh";
import { stat, readFileBuffer } from "@/lib/sftp-ops";
import { requireFbContext, handleFbError } from "@/lib/filebrowser/route-helpers";
import { resolveVirtualPath, getSambaWebUser, FbAccessError } from "@/lib/filebrowser/access";
import { isThumbnailableExtension, getCachedThumbnail, generateAndCacheThumbnail } from "@/lib/filebrowser/thumbnails";

// Generiert bei Bedarf ein ~200px-JPEG-Thumbnail und cached es lokal auf dem
// NetMaster-Host (nicht auf dem Zielserver). Nur erreichbar, wenn der Admin
// thumbnailsEnabled für diesen User gesetzt hat - Verteidigung in der Tiefe,
// die UI fragt Thumbnails ohnehin nur dann an.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const ctx = await requireFbContext(serverId);

    const webUser = await getSambaWebUser(serverId, ctx.username);
    if (!webUser?.thumbnailsEnabled) {
      throw new FbAccessError(403, "THUMBNAILS_DISABLED");
    }

    const url = new URL(req.url);
    const virtualPath = url.searchParams.get("path");
    if (!virtualPath) throw new FbAccessError(400, "INVALID_PATH");
    if (!isThumbnailableExtension(virtualPath)) {
      throw new FbAccessError(400, "NOT_AN_IMAGE");
    }

    const resolved = resolveVirtualPath(ctx.shares, virtualPath);
    const { conn, sftp } = await openSftpSessionAs(ctx.server, ctx.username, ctx.password);
    try {
      const info = await stat(sftp, resolved.absPath);
      if (info.isDirectory) throw new FbAccessError(400, "NOT_AN_IMAGE");

      const cached = await getCachedThumbnail(serverId, ctx.username, resolved.absPath, info.mtimeMs);
      if (cached) {
        return new Response(new Uint8Array(cached), {
          headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
        });
      }

      const source = await readFileBuffer(sftp, resolved.absPath);
      const thumb = await generateAndCacheThumbnail(serverId, ctx.username, resolved.absPath, info.mtimeMs, source);
      return new Response(new Uint8Array(thumb), {
        headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
      });
    } finally {
      conn.end();
    }
  } catch (err) {
    return handleFbError(err);
  }
}
