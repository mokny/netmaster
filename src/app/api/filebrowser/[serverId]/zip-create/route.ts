import path from "node:path";
import { NextResponse } from "next/server";
import { ZipArchive } from "archiver";
import { openSftpSessionAs } from "@/lib/ssh";
import { collectFilesRecursive, createRemoteReadStream, createRemoteWriteStream } from "@/lib/sftp-ops";
import { requireFbContext, handleFbError } from "@/lib/filebrowser/route-helpers";
import { resolveVirtualPath, requireWritable, FbAccessError } from "@/lib/filebrowser/access";
import { resolveDestination, type ConflictMode } from "@/lib/filebrowser/conflict";

// "ZIP hier erstellen" - Gegenstück zum bestehenden Live-Download-ZIP
// (zip/route.ts): baut das Archiv genauso mit `archiver` auf, pumpt es aber
// NICHT in die HTTP-Response, sondern über dieselbe SFTP-Verbindung zurück
// auf den Zielserver (createRemoteWriteStream) - die entstandene .zip-Datei
// landet danach als ganz normale Datei im aktuellen Verzeichnis.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const ctx = await requireFbContext(serverId);
    const body = await req.json().catch(() => null);
    const paths = Array.isArray(body?.paths) ? body.paths.filter((p: unknown) => typeof p === "string") : [];
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const conflict: ConflictMode = body?.conflict === "overwrite" || body?.conflict === "rename" ? body.conflict : undefined;

    if (paths.length === 0) throw new FbAccessError(400, "INVALID_PATH");
    if (!name || name.includes("/") || name === "." || name === "..") {
      throw new FbAccessError(400, "INVALID_NAME");
    }
    const zipName = name.toLowerCase().endsWith(".zip") ? name : `${name}.zip`;

    const resolvedItems = paths.map((p: string) => resolveVirtualPath(ctx.shares, p));
    // Alle ausgewählten Elemente müssen aus demselben Ordner (derselben
    // Freigabe) stammen - das Zielverzeichnis der neuen .zip ist deren
    // gemeinsames Elternverzeichnis.
    const firstDir = path.posix.dirname(resolvedItems[0].absPath);
    for (const item of resolvedItems) {
      if (path.posix.dirname(item.absPath) !== firstDir) {
        throw new FbAccessError(400, "INVALID_PATH");
      }
      requireWritable(item);
    }
    const destTargetPath = path.posix.join(firstDir, zipName);

    const { conn, sftp } = await openSftpSessionAs(ctx.server, ctx.username, ctx.password);
    try {
      const destPath = await resolveDestination(sftp, destTargetPath, conflict);

      const allFiles: { absPath: string; relPath: string }[] = [];
      for (const item of resolvedItems) {
        const rootName = path.posix.basename(item.absPath);
        const files = await collectFilesRecursive(sftp, item.absPath, rootName);
        allFiles.push(...files);
      }

      await new Promise<void>((resolve, reject) => {
        const archive = new ZipArchive({ zlib: { level: 6 } });
        const out = createRemoteWriteStream(sftp, destPath);
        archive.on("warning", (err: Error) => console.error("Zip-Warnung:", err));
        archive.on("error", (err: Error) => reject(err));
        out.on("error", (err: Error) => reject(err));
        out.on("close", () => resolve());
        archive.pipe(out);
        for (const file of allFiles) {
          archive.append(createRemoteReadStream(sftp, file.absPath), { name: file.relPath });
        }
        void archive.finalize();
      });

      return NextResponse.json({ ok: true, path: destPath });
    } finally {
      conn.end();
    }
  } catch (err) {
    return handleFbError(err);
  }
}
