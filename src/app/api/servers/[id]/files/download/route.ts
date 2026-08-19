import { Readable } from "node:stream";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError, ApiError } from "@/lib/api-helpers";
import { openSftpSession } from "@/lib/ssh";
import { writeAuditLog } from "@/lib/audit";
import { stat, createRemoteReadStream } from "@/lib/sftp-ops";

// Einzeldatei-Download. Läuft bewusst über eine normale GET-Route (statt über
// die Panel-WebSocket), weil das native "aus dem Browser aufs Desktop ziehen"
// (Drag-Out) einen abrufbaren HTTP-URL benötigt (DownloadURL-DnD-API).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { id } = await params;
    const url = new URL(req.url);
    const filePath = url.searchParams.get("path");
    if (!filePath || !filePath.startsWith("/")) {
      throw new ApiError(400, "Ungültiger Pfad");
    }

    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    const { conn, sftp } = await openSftpSession(server);

    const info = await stat(sftp, filePath);
    if (info.isDirectory) {
      conn.end();
      throw new ApiError(400, "Verzeichnisse können nur als ZIP heruntergeladen werden");
    }

    void writeAuditLog(session, "files.download", { serverId: id, detail: filePath });

    const nodeStream = createRemoteReadStream(sftp, filePath);
    nodeStream.on("close", () => conn.end());
    nodeStream.on("error", () => conn.end());

    const webStream = Readable.toWeb(nodeStream) as ReadableStream;
    const filename = path.posix.basename(filePath);

    return new Response(webStream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(info.size),
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
