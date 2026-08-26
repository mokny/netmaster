import { Readable } from "node:stream";
import path from "node:path";
import { openSftpSessionAs } from "@/lib/ssh";
import { stat, createRemoteReadStream } from "@/lib/sftp-ops";
import { requireFbContext, handleFbError } from "@/lib/filebrowser/route-helpers";
import { resolveVirtualPath, FbAccessError } from "@/lib/filebrowser/access";

// Einzeldatei-Download/-Vorschau. `disposition=inline` (für die
// Bild/PDF/Text-Vorschau) statt des Standards `attachment` (echter Download).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const ctx = await requireFbContext(serverId);
    const url = new URL(req.url);
    const virtualPath = url.searchParams.get("path");
    const disposition = url.searchParams.get("disposition") === "inline" ? "inline" : "attachment";
    if (!virtualPath) throw new FbAccessError(400, "INVALID_PATH");

    const resolved = resolveVirtualPath(ctx.shares, virtualPath);
    const { conn, sftp } = await openSftpSessionAs(ctx.server, ctx.username, ctx.password);

    const info = await stat(sftp, resolved.absPath);
    if (info.isDirectory) {
      conn.end();
      throw new FbAccessError(400, "DIRECTORY_DOWNLOAD_REQUIRES_ZIP");
    }

    const nodeStream = createRemoteReadStream(sftp, resolved.absPath);
    nodeStream.on("close", () => conn.end());
    nodeStream.on("error", () => conn.end());

    const webStream = Readable.toWeb(nodeStream) as ReadableStream;
    const filename = path.posix.basename(resolved.absPath);

    return new Response(webStream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(info.size),
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (err) {
    return handleFbError(err);
  }
}
