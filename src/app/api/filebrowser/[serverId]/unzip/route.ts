import path from "node:path";
import { NextResponse } from "next/server";
import unzipper from "unzipper";
import { openSftpSessionAs } from "@/lib/ssh";
import { mkdirRecursive, createRemoteReadStream, createRemoteWriteStream, stat } from "@/lib/sftp-ops";
import { requireFbContext, handleFbError } from "@/lib/filebrowser/route-helpers";
import { resolveVirtualPath, requireWritable, FbAccessError } from "@/lib/filebrowser/access";
import { resolveDestination } from "@/lib/filebrowser/conflict";

// "Entpacken" - Gegenstück zu zip-create. Läuft rein über SFTP: der
// Ziel-User hat die Shell /usr/sbin/nologin und sshd erzwingt für ihn
// `ForceCommand internal-sftp` (siehe syncFilebrowserSshdUsers in
// lib/storage/samba.ts) - es gibt also KEIN `unzip`-Binary, das man per
// Shell-Exec aufrufen könnte. Stattdessen wird der entfernte .zip-Stream per
// `unzipper.Parse()` (Vorwärts-Streaming über die lokalen Dateiköpfe, KEIN
// Random-Access auf das zentrale Verzeichnis am Ende der Datei nötig) Eintrag
// für Eintrag gelesen und direkt weiter auf den Zielserver geschrieben - zu
// keinem Zeitpunkt liegt das gesamte Archiv im Speicher von NetMaster
// (wichtig auf einem Raspberry Pi mit wenig RAM).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const ctx = await requireFbContext(serverId);
    const body = await req.json().catch(() => null);
    const virtualPath = typeof body?.path === "string" ? body.path : "";
    if (!virtualPath) throw new FbAccessError(400, "INVALID_PATH");

    const resolved = resolveVirtualPath(ctx.shares, virtualPath);
    requireWritable(resolved);
    if (!resolved.absPath.toLowerCase().endsWith(".zip")) {
      throw new FbAccessError(400, "NOT_A_ZIP");
    }

    // Immer in dasselbe Verzeichnis wie die .zip selbst entpacken (wie der
    // Finder-/Explorer-Standard "Hier entpacken") - keine
    // Zielordner-Auswahl-UI dafür.
    const destDir = path.posix.dirname(resolved.absPath);

    const { conn, sftp } = await openSftpSessionAs(ctx.server, ctx.username, ctx.password);
    try {
      const info = await stat(sftp, resolved.absPath);
      if (info.isDirectory) throw new FbAccessError(400, "NOT_A_ZIP");

      let extracted = 0;
      await new Promise<void>((resolve, reject) => {
        const source = createRemoteReadStream(sftp, resolved.absPath);
        const zip = source.pipe(unzipper.Parse({ forceStream: true }));

        zip.on("error", (err: Error) => reject(err));
        source.on("error", (err: Error) => reject(err));

        zip.on("entry", (entry: unzipper.Entry) => {
          void (async () => {
            try {
              // Zip-Slip-Schutz: der Eintragspfad darf nach dem Normalisieren
              // das Zielverzeichnis nicht verlassen (z.B. "../../etc/passwd").
              // Verteidigung in der Tiefe wie resolveVirtualPath - zusätzlich
              // greifen die OS-Rechte des per SFTP verbundenen Unix-Users.
              const rawEntryPath = entry.path.replace(/\\/g, "/");
              const normalized = path.posix.normalize(rawEntryPath).replace(/^(\.\.(\/|$))+/, "");
              if (!normalized || normalized === "." || normalized.split("/").includes("..")) {
                entry.autodrain();
                return;
              }
              const targetPath = path.posix.join(destDir, normalized);
              const relFromDest = path.posix.relative(destDir, targetPath);
              if (relFromDest.startsWith("..") || path.posix.isAbsolute(relFromDest)) {
                entry.autodrain();
                return;
              }

              if (entry.type === "Directory") {
                await mkdirRecursive(sftp, targetPath);
                entry.autodrain();
                return;
              }

              await mkdirRecursive(sftp, path.posix.dirname(targetPath));
              const finalPath = await resolveDestination(sftp, targetPath, "rename");
              await new Promise<void>((res, rej) => {
                const writeStream = createRemoteWriteStream(sftp, finalPath);
                writeStream.on("error", rej);
                writeStream.on("close", () => res());
                entry.pipe(writeStream);
                entry.on("error", rej);
              });
              extracted += 1;
            } catch (err) {
              reject(err instanceof Error ? err : new Error(String(err)));
            }
          })();
        });

        zip.on("close", () => resolve());
        zip.on("finish", () => resolve());
      });

      return NextResponse.json({ ok: true, extracted });
    } finally {
      conn.end();
    }
  } catch (err) {
    return handleFbError(err);
  }
}
