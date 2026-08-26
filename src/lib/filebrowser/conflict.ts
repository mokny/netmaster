import path from "node:path";
import type { SFTPWrapper } from "ssh2";
import { stat, removeRecursive, SftpOpError } from "@/lib/sftp-ops";

export type ConflictMode = "overwrite" | "rename" | undefined;

async function pathExists(sftp: SFTPWrapper, p: string): Promise<boolean> {
  try {
    await stat(sftp, p);
    return true;
  } catch (err) {
    if (err instanceof SftpOpError && err.code === "NOT_FOUND") return false;
    throw err;
  }
}

async function autoRename(sftp: SFTPWrapper, destPath: string): Promise<string> {
  const dir = path.posix.dirname(destPath);
  const base = path.posix.basename(destPath);
  const extIdx = base.lastIndexOf(".");
  const hasExt = extIdx > 0;
  const stem = hasExt ? base.slice(0, extIdx) : base;
  const ext = hasExt ? base.slice(extIdx) : "";
  let n = 1;
  let candidate = path.posix.join(dir, `${stem} (${n})${ext}`);
  while (await pathExists(sftp, candidate)) {
    n += 1;
    candidate = path.posix.join(dir, `${stem} (${n})${ext}`);
  }
  return candidate;
}

// Ermittelt den effektiven Zielpfad je nach Konfliktmodus, analog zum
// bestehenden Upload-Konfliktmuster (SftpOpError "EXISTS" -> 409, vom
// Client als Overwrite/Auto-rename/Abbrechen-Dialog dargestellt):
// - undefined: wirft bei existierendem Ziel SftpOpError("EXISTS")
// - "overwrite": löscht ein bestehendes Ziel vorher (SFTP-rename überschreibt
//   sonst nicht) und gibt denselben Pfad zurück
// - "rename": hängt "(1)", "(2)", ... vor die Dateiendung an
export async function resolveDestination(
  sftp: SFTPWrapper,
  destPath: string,
  conflict: ConflictMode
): Promise<string> {
  const exists = await pathExists(sftp, destPath);
  if (!exists) return destPath;
  if (conflict === "overwrite") {
    await removeRecursive(sftp, destPath);
    return destPath;
  }
  if (conflict === "rename") {
    return autoRename(sftp, destPath);
  }
  throw new SftpOpError(`"${path.posix.basename(destPath)}" existiert bereits`, "EXISTS");
}
