import { Readable } from "node:stream";
import path from "node:path";
import { NextResponse } from "next/server";
import { openSftpSessionAs } from "@/lib/ssh";
import { mkdirRecursive, createRemoteWriteStream, SftpOpError } from "@/lib/sftp-ops";
import { requireFbContext, handleFbError } from "@/lib/filebrowser/route-helpers";
import { resolveVirtualPath, requireWritable, FbAccessError } from "@/lib/filebrowser/access";
import { resolveDestination, type ConflictMode } from "@/lib/filebrowser/conflict";
import type { SFTPWrapper } from "ssh2";

function pipeToRemote(sftp: SFTPWrapper, filePath: string, source: Readable): Promise<void> {
  return new Promise((resolve, reject) => {
    const dest = createRemoteWriteStream(sftp, filePath);
    dest.on("error", reject);
    dest.on("close", resolve);
    source.on("error", reject);
    source.pipe(dest);
  });
}

// Einzeldatei-Upload, END-ZU-END GESTREAMT (siehe AGENTS-Vorgabe #7): der
// Request-Body IST direkt die Datei (kein multipart/formData mehr - das
// puffert den kompletten Body serverseitig, egal was man danach damit macht,
// und lässt zudem den `req.formData()`-Aufruf gegen das
// `proxyClientMaxBodySize`-Limit laufen). `targetPath`/`relPath`/`conflict`
// kommen stattdessen als Query-Parameter (ein Upload = ein Request, siehe
// fbUploadFile in api-client.ts). Der Web-`ReadableStream` aus `req.body`
// wird direkt in einen Node-Stream konvertiert und in die SFTP-Schreib-
// Verbindung gepiped, ohne je einen vollständigen Buffer im Speicher zu
// halten (wichtig auf RAM-knappen Raspberry Pis).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const ctx = await requireFbContext(serverId);

    const url = new URL(req.url);
    const targetPath = url.searchParams.get("targetPath");
    const relPath = url.searchParams.get("relPath");
    const conflictParam = url.searchParams.get("conflict");
    if (typeof targetPath !== "string" || !targetPath) throw new FbAccessError(400, "INVALID_PATH");
    if (typeof relPath !== "string" || !relPath) throw new FbAccessError(400, "NO_VALID_FILES_SUBMITTED");
    const conflict: ConflictMode =
      conflictParam === "overwrite" || conflictParam === "rename" ? conflictParam : undefined;

    const resolvedTarget = resolveVirtualPath(ctx.shares, targetPath);
    requireWritable(resolvedTarget);

    const cleanRelPath = relPath.replace(/^\/+/, "");
    const destPath = path.posix.join(resolvedTarget.absPath, cleanRelPath);
    const destDir = path.posix.dirname(destPath);

    if (!req.body) {
      throw new FbAccessError(400, "NO_VALID_FILES_SUBMITTED");
    }

    const { conn, sftp } = await openSftpSessionAs(ctx.server, ctx.username, ctx.password);
    try {
      await mkdirRecursive(sftp, destDir);
      const finalDest = await resolveDestination(sftp, destPath, conflict);

      const nodeReadable = Readable.fromWeb(req.body as import("node:stream/web").ReadableStream<Uint8Array>);
      await pipeToRemote(sftp, finalDest, nodeReadable);

      return NextResponse.json({ ok: true, uploaded: 1 });
    } finally {
      conn.end();
    }
  } catch (err) {
    if (err instanceof SftpOpError && err.code === "EXISTS") {
      return NextResponse.json({ error: "EXISTS", detail: err.message }, { status: 409 });
    }
    return handleFbError(err);
  }
}
