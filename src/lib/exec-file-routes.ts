import { Readable } from "node:stream";
import path from "node:path";
import { ZipArchive } from "archiver";
import { NextResponse } from "next/server";
import { ApiError, handleApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import type { SessionPayload } from "@/lib/session-token";
import { ExecFileOpError, type FileBackend } from "@/lib/exec-file-backend";

// Gemeinsame Download-/ZIP-/Upload-Handler für die Docker- und Proxmox-
// Dateimanager-Routen - Gegenstück zu den SFTP-Routen unter
// /api/servers/[id]/files/*, nur gegen ein FileBackend (Shell statt SFTP)
// statt eine offene SFTP-Session.

export async function handleExecDownload(
  backend: FileBackend,
  filePath: string,
  session: SessionPayload,
  auditContext: { serverId: string; detail: string }
) {
  try {
    if (!filePath || !filePath.startsWith("/")) throw new ApiError(400, "INVALID_PATH");
    const info = await backend.statSize(filePath);
    if (info.isDirectory) throw new ApiError(400, "DIRECTORY_DOWNLOAD_REQUIRES_ZIP");

    const buf = await backend.readFileBuffer(filePath);
    void writeAuditLog(session, "files.download", {
      serverId: auditContext.serverId,
      detail: `[${auditContext.detail}] ${filePath}`,
    });

    const filename = path.posix.basename(filePath);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(buf.length),
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (err) {
    return execErrorResponse(err);
  }
}

export async function handleExecZip(
  backend: FileBackend,
  dirPath: string,
  session: SessionPayload,
  auditContext: { serverId: string; detail: string }
) {
  try {
    if (!dirPath || !dirPath.startsWith("/")) throw new ApiError(400, "INVALID_PATH");
    const rootName = path.posix.basename(dirPath) || "root";
    const files = await backend.collectFilesRecursive(dirPath, rootName);

    void writeAuditLog(session, "files.download-zip", {
      serverId: auditContext.serverId,
      detail: `[${auditContext.detail}] ${dirPath} (${files.length} Datei(en))`,
    });

    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.on("warning", (err: Error) => console.error("Zip-Warnung:", err));
    archive.on("error", (err: Error) => console.error("Zip-Fehler:", err));

    void (async () => {
      for (const file of files) {
        try {
          const buf = await backend.readFileBuffer(file.absPath);
          archive.append(buf, { name: file.relPath });
        } catch (err) {
          console.error(`Zip: Datei konnte nicht gelesen werden (${file.absPath}):`, err);
        }
      }
      void archive.finalize();
    })();

    const webStream = Readable.toWeb(archive) as ReadableStream;
    return new Response(webStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(rootName)}.zip"`,
      },
    });
  } catch (err) {
    return execErrorResponse(err);
  }
}

export async function handleExecUpload(
  backend: FileBackend,
  req: Request,
  session: SessionPayload,
  auditContext: { serverId: string; detail: string }
) {
  try {
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

    const uploaded: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const relPath = relPaths[i].replace(/^\/+/, "");
      const destPath = path.posix.join(targetDir, relPath);
      if (!overwrite) {
        try {
          await backend.statSize(destPath);
          throw new ExecFileOpError(`"${path.posix.basename(destPath)}" existiert bereits`, "EXISTS");
        } catch (err) {
          if (err instanceof ExecFileOpError && err.code === "EXISTS") throw err;
          // NOT_FOUND ist der Normalfall (Ziel existiert noch nicht).
        }
      }
      const buf = Buffer.from(await files[i].arrayBuffer());
      await backend.writeFileBuffer(destPath, buf);
      uploaded.push(destPath);
    }

    await writeAuditLog(session, "files.upload", {
      serverId: auditContext.serverId,
      detail: `[${auditContext.detail}] ${uploaded.length} Datei(en) nach ${targetDir}`,
    });

    return NextResponse.json({ ok: true, uploaded });
  } catch (err) {
    return execErrorResponse(err);
  }
}

function execErrorResponse(err: unknown) {
  if (err instanceof ExecFileOpError && err.code === "EXISTS") {
    return NextResponse.json({ error: err.message, code: "EXISTS" }, { status: 409 });
  }
  return handleApiError(err);
}
