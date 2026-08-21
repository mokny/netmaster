import { NextResponse } from "next/server";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError, ApiError } from "@/lib/api-helpers";
import { openSftpSession } from "@/lib/ssh";
import { writeAuditLog } from "@/lib/audit";
import { mkdirRecursive, assertNotExists, SftpOpError } from "@/lib/sftp-ops";
import type { SFTPWrapper } from "ssh2";

function writeStream(sftp: SFTPWrapper, filePath: string, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = sftp.createWriteStream(filePath);
    stream.on("error", reject);
    stream.end(data, () => resolve());
  });
}

// Drag&Drop-Upload (einzelne Dateien oder ganze Ordner) aus dem Dateimanager.
// `relPaths[]` enthält für jede Datei den relativen Pfad (inkl. Unterordner),
// jeweils an gleicher Position wie das zugehörige `files`-Feld.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { id } = await params;
    const server = await prisma.server.findUniqueOrThrow({ where: { id } });

    const form = await req.formData();
    const targetDir = form.get("targetDir");
    const overwrite = form.get("overwrite") === "true";
    if (typeof targetDir !== "string" || !targetDir.startsWith("/")) {
      throw new ApiError(400, "INVALID_TARGET_DIRECTORY");
    }
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    const relPaths = form.getAll("relPaths").map((v) => String(v));
    if (files.length === 0 || files.length !== relPaths.length) {
      throw new ApiError(400, "NO_VALID_FILES_SUBMITTED");
    }

    const { conn, sftp } = await openSftpSession(server);
    const uploaded: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const relPath = relPaths[i].replace(/^\/+/, "");
        const destPath = path.posix.join(targetDir, relPath);
        const destDir = path.posix.dirname(destPath);
        await mkdirRecursive(sftp, destDir);
        if (!overwrite) {
          await assertNotExists(sftp, destPath);
        }
        const buf = Buffer.from(await files[i].arrayBuffer());
        await writeStream(sftp, destPath, buf);
        uploaded.push(destPath);
      }
    } finally {
      conn.end();
    }

    await writeAuditLog(session, "files.upload", {
      serverId: id,
      detail: `${uploaded.length} Datei(en) nach ${targetDir}`,
    });

    return NextResponse.json({ ok: true, uploaded });
  } catch (err) {
    if (err instanceof SftpOpError && err.code === "EXISTS") {
      return NextResponse.json(
        { error: "FILE_EXISTS", detail: err.message, code: "EXISTS" },
        { status: 409 }
      );
    }
    return handleApiError(err);
  }
}
