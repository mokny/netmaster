import { Readable } from "node:stream";
import path from "node:path";
import { ZipArchive } from "archiver";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError, ApiError } from "@/lib/api-helpers";
import { openSftpSession } from "@/lib/ssh";
import { writeAuditLog } from "@/lib/audit";
import { collectFilesRecursive, createRemoteReadStream } from "@/lib/sftp-ops";

// Ordner-Download als ZIP: wird auf NetMaster live gestreamt (Dateien per SFTP
// lesen, per `archiver` zippen), damit der Zielserver kein zip/tar benötigt.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { id } = await params;
    const url = new URL(req.url);
    const dirPath = url.searchParams.get("path");
    if (!dirPath || !dirPath.startsWith("/")) {
      throw new ApiError(400, "INVALID_PATH");
    }

    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    const { conn, sftp } = await openSftpSession(server);

    const rootName = path.posix.basename(dirPath) || "root";
    const files = await collectFilesRecursive(sftp, dirPath, rootName);

    void writeAuditLog(session, "files.download-zip", {
      serverId: id,
      detail: `${dirPath} (${files.length} Datei(en))`,
    });

    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.on("warning", (err: Error) => console.error("Zip-Warnung:", err));
    archive.on("error", (err: Error) => console.error("Zip-Fehler:", err));
    archive.on("end", () => conn.end());

    for (const file of files) {
      archive.append(createRemoteReadStream(sftp, file.absPath), { name: file.relPath });
    }
    void archive.finalize();

    const webStream = Readable.toWeb(archive) as ReadableStream;

    return new Response(webStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(rootName)}.zip"`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
