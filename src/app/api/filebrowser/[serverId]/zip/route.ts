import { Readable } from "node:stream";
import path from "node:path";
import { ZipArchive } from "archiver";
import { openSftpSessionAs } from "@/lib/ssh";
import { collectFilesRecursive, createRemoteReadStream } from "@/lib/sftp-ops";
import { requireFbContext, handleFbError } from "@/lib/filebrowser/route-helpers";
import { resolveVirtualPath, FbAccessError } from "@/lib/filebrowser/access";

// Ordner- oder Mehrfachauswahl-Download als ZIP, live gestreamt (wie die
// Admin-Variante in servers/[id]/files/zip/route.ts) - nimmt mehrere
// `path`-Query-Parameter für eine Mehrfachauswahl entgegen.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const ctx = await requireFbContext(serverId);
    const url = new URL(req.url);
    const virtualPaths = url.searchParams.getAll("path");
    if (virtualPaths.length === 0) throw new FbAccessError(400, "INVALID_PATH");

    const resolvedItems = virtualPaths.map((p) => resolveVirtualPath(ctx.shares, p));
    const { conn, sftp } = await openSftpSessionAs(ctx.server, ctx.username, ctx.password);

    const allFiles: { absPath: string; relPath: string }[] = [];
    for (const item of resolvedItems) {
      const rootName = path.posix.basename(item.absPath) || item.share.name;
      const files = await collectFilesRecursive(sftp, item.absPath, rootName);
      allFiles.push(...files);
    }

    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.on("warning", (err: Error) => console.error("Zip-Warnung:", err));
    archive.on("error", (err: Error) => console.error("Zip-Fehler:", err));
    archive.on("end", () => conn.end());

    for (const file of allFiles) {
      archive.append(createRemoteReadStream(sftp, file.absPath), { name: file.relPath });
    }
    void archive.finalize();

    const webStream = Readable.toWeb(archive) as ReadableStream;
    const zipName = resolvedItems.length === 1 ? path.posix.basename(resolvedItems[0].absPath) : "download";

    return new Response(webStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(zipName)}.zip"`,
      },
    });
  } catch (err) {
    return handleFbError(err);
  }
}
