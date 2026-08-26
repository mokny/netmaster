import path from "node:path";
import { NextResponse } from "next/server";
import { openSftpSessionAs } from "@/lib/ssh";
import { mkdirRecursive, createRemoteWriteStream, SftpOpError } from "@/lib/sftp-ops";
import { requireFbContext, handleFbError } from "@/lib/filebrowser/route-helpers";
import { resolveVirtualPath, requireWritable, FbAccessError } from "@/lib/filebrowser/access";
import { resolveDestination, type ConflictMode } from "@/lib/filebrowser/conflict";
import type { SFTPWrapper } from "ssh2";

function writeBuffer(sftp: SFTPWrapper, filePath: string, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = createRemoteWriteStream(sftp, filePath);
    stream.on("error", reject);
    stream.end(data, () => resolve());
  });
}

// Drag&Drop-/Auswahl-Upload (einzelne Dateien oder ganze Ordner, `relPaths[]`
// trägt für jede Datei den relativen Pfad inkl. Unterordner). `conflict`
// gilt einheitlich für den ganzen Batch (entspricht der "Für alle
// anwenden"-Checkbox im Konflikt-Dialog des Clients).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const ctx = await requireFbContext(serverId);

    const form = await req.formData();
    const targetPath = form.get("targetPath");
    if (typeof targetPath !== "string") throw new FbAccessError(400, "INVALID_PATH");
    const conflict: ConflictMode = form.get("conflict") === "overwrite" || form.get("conflict") === "rename"
      ? (form.get("conflict") as ConflictMode)
      : undefined;

    const resolvedTarget = resolveVirtualPath(ctx.shares, targetPath);
    requireWritable(resolvedTarget);

    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    const relPaths = form.getAll("relPaths").map((v) => String(v));
    if (files.length === 0 || files.length !== relPaths.length) {
      throw new FbAccessError(400, "NO_VALID_FILES_SUBMITTED");
    }

    const { conn, sftp } = await openSftpSessionAs(ctx.server, ctx.username, ctx.password);
    const uploaded: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const relPath = relPaths[i].replace(/^\/+/, "");
        const destPath = path.posix.join(resolvedTarget.absPath, relPath);
        const destDir = path.posix.dirname(destPath);
        await mkdirRecursive(sftp, destDir);
        const finalDest = await resolveDestination(sftp, destPath, conflict);
        const buf = Buffer.from(await files[i].arrayBuffer());
        await writeBuffer(sftp, finalDest, buf);
        uploaded.push(finalDest);
      }
      return NextResponse.json({ ok: true, uploaded: uploaded.length });
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
