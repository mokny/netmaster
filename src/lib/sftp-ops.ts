import path from "node:path";
import type { SFTPWrapper } from "ssh2";

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  isSymlink: boolean;
  size: number;
  mode: number;
  mtime: number;
}

export class SftpOpError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "EXISTS" | "IS_DIR" | "NOT_DIR" | "TOO_LARGE" | "BINARY" | "OTHER" = "OTHER"
  ) {
    super(message);
  }
}

// Größenlimit für den Text-Editor: Binär-/Riesendateien werden nur zum
// Download angeboten, nicht zum Editieren geöffnet.
export const MAX_EDITABLE_BYTES = 3 * 1024 * 1024;

function posixJoin(dir: string, name: string): string {
  return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

export function homeDir(sftp: SFTPWrapper): Promise<string> {
  return new Promise((resolve, reject) => {
    sftp.realpath(".", (err, absPath) => {
      if (err) return reject(err);
      resolve(absPath);
    });
  });
}

export function listDir(sftp: SFTPWrapper, dirPath: string): Promise<FileNode[]> {
  return new Promise((resolve, reject) => {
    sftp.readdir(dirPath, (err, list) => {
      if (err) return reject(new SftpOpError(err.message, "NOT_FOUND"));
      const nodes = list
        .filter((e) => e.filename !== "." && e.filename !== "..")
        .map((e) => ({
          name: e.filename,
          path: posixJoin(dirPath, e.filename),
          isDirectory: e.attrs.isDirectory(),
          isSymlink: e.attrs.isSymbolicLink(),
          size: e.attrs.size,
          mode: e.attrs.mode,
          mtime: e.attrs.mtime * 1000,
        }))
        .sort((a, b) =>
          a.isDirectory === b.isDirectory
            ? a.name.localeCompare(b.name)
            : a.isDirectory
              ? -1
              : 1
        );
      resolve(nodes);
    });
  });
}

export function stat(sftp: SFTPWrapper, filePath: string) {
  return new Promise<{ isDirectory: boolean; size: number; mode: number }>((resolve, reject) => {
    sftp.stat(filePath, (err, stats) => {
      if (err) return reject(new SftpOpError(err.message, "NOT_FOUND"));
      resolve({ isDirectory: stats.isDirectory(), size: stats.size, mode: stats.mode });
    });
  });
}

function exists(sftp: SFTPWrapper, filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    sftp.stat(filePath, (err) => resolve(!err));
  });
}

export async function assertNotExists(sftp: SFTPWrapper, filePath: string) {
  if (await exists(sftp, filePath)) {
    throw new SftpOpError(`"${path.posix.basename(filePath)}" existiert bereits`, "EXISTS");
  }
}

export function mkdir(sftp: SFTPWrapper, dirPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.mkdir(dirPath, (err) => {
      if (err) return reject(new SftpOpError(err.message, "OTHER"));
      resolve();
    });
  });
}

// Legt ein Verzeichnis inkl. fehlender Elternverzeichnisse an (wie `mkdir -p`),
// für rekursive Ordner-Uploads.
export async function mkdirRecursive(sftp: SFTPWrapper, dirPath: string): Promise<void> {
  if (await exists(sftp, dirPath)) return;
  const parent = path.posix.dirname(dirPath);
  if (parent !== dirPath && parent !== "." && parent !== "/") {
    await mkdirRecursive(sftp, parent);
  }
  if (!(await exists(sftp, dirPath))) {
    await mkdir(sftp, dirPath);
  }
}

export function touch(sftp: SFTPWrapper, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = sftp.createWriteStream(filePath);
    stream.on("error", (err: Error) => reject(new SftpOpError(err.message, "OTHER")));
    stream.end(Buffer.alloc(0), () => resolve());
  });
}

export function renamePath(sftp: SFTPWrapper, from: string, to: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.rename(from, to, (err) => {
      if (err) return reject(new SftpOpError(err.message, "OTHER"));
      resolve();
    });
  });
}

export function chmodPath(sftp: SFTPWrapper, filePath: string, mode: number): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.chmod(filePath, mode, (err) => {
      if (err) return reject(new SftpOpError(err.message, "OTHER"));
      resolve();
    });
  });
}

export function chownPath(sftp: SFTPWrapper, filePath: string, uid: number, gid: number): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.chown(filePath, uid, gid, (err) => {
      if (err) return reject(new SftpOpError(err.message, "OTHER"));
      resolve();
    });
  });
}

async function unlinkFile(sftp: SFTPWrapper, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.unlink(filePath, (err) => {
      if (err) return reject(new SftpOpError(err.message, "OTHER"));
      resolve();
    });
  });
}

async function rmdirEmpty(sftp: SFTPWrapper, dirPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.rmdir(dirPath, (err) => {
      if (err) return reject(new SftpOpError(err.message, "OTHER"));
      resolve();
    });
  });
}

export async function removeRecursive(sftp: SFTPWrapper, targetPath: string): Promise<void> {
  const info = await stat(sftp, targetPath);
  if (!info.isDirectory) {
    await unlinkFile(sftp, targetPath);
    return;
  }
  const children = await listDir(sftp, targetPath);
  for (const child of children) {
    await removeRecursive(sftp, child.path);
  }
  await rmdirEmpty(sftp, targetPath);
}

function readFileBuffer(sftp: SFTPWrapper, filePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = sftp.createReadStream(filePath);
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("error", (err: Error) => reject(new SftpOpError(err.message, "OTHER")));
    stream.on("close", () => resolve(Buffer.concat(chunks)));
  });
}

function writeFileBuffer(sftp: SFTPWrapper, filePath: string, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = sftp.createWriteStream(filePath);
    stream.on("error", (err: Error) => reject(new SftpOpError(err.message, "OTHER")));
    stream.end(data, () => resolve());
  });
}

function looksBinary(buf: Buffer): boolean {
  const sampleLen = Math.min(buf.length, 8000);
  for (let i = 0; i < sampleLen; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

export async function readFileText(sftp: SFTPWrapper, filePath: string): Promise<string> {
  const info = await stat(sftp, filePath);
  if (info.isDirectory) throw new SftpOpError("Ist ein Verzeichnis", "IS_DIR");
  if (info.size > MAX_EDITABLE_BYTES) {
    throw new SftpOpError("File is too large to edit", "TOO_LARGE");
  }
  const buf = await readFileBuffer(sftp, filePath);
  if (looksBinary(buf)) {
    throw new SftpOpError("File appears to be binary", "BINARY");
  }
  return buf.toString("utf8");
}

export async function writeFileText(sftp: SFTPWrapper, filePath: string, content: string): Promise<void> {
  await writeFileBuffer(sftp, filePath, Buffer.from(content, "utf8"));
}

async function copyFile(sftp: SFTPWrapper, from: string, to: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const read = sftp.createReadStream(from);
    const write = sftp.createWriteStream(to);
    read.on("error", (err: Error) => reject(new SftpOpError(err.message, "OTHER")));
    write.on("error", (err: Error) => reject(new SftpOpError(err.message, "OTHER")));
    write.on("close", () => resolve());
    read.pipe(write);
  });
}

export async function copyRecursive(sftp: SFTPWrapper, from: string, to: string): Promise<void> {
  const info = await stat(sftp, from);
  if (!info.isDirectory) {
    await copyFile(sftp, from, to);
    return;
  }
  await mkdir(sftp, to);
  const children = await listDir(sftp, from);
  for (const child of children) {
    await copyRecursive(sftp, child.path, posixJoin(to, child.name));
  }
}

export async function movePath(sftp: SFTPWrapper, from: string, to: string): Promise<void> {
  try {
    await renamePath(sftp, from, to);
  } catch {
    // Fallback für Verschieben über Dateisystemgrenzen hinweg (rename schlägt
    // z.B. bei manchen SFTP-Servern über Mountpoints hinweg fehl).
    await copyRecursive(sftp, from, to);
    await removeRecursive(sftp, from);
  }
}

// Sammelt rekursiv alle Dateien (keine Verzeichniseinträge) für den ZIP-Download,
// jeweils mit dem relativen Pfad innerhalb des Wurzelverzeichnisses.
export async function collectFilesRecursive(
  sftp: SFTPWrapper,
  rootPath: string,
  rootName: string
): Promise<{ absPath: string; relPath: string }[]> {
  const info = await stat(sftp, rootPath);
  if (!info.isDirectory) {
    return [{ absPath: rootPath, relPath: rootName }];
  }
  const out: { absPath: string; relPath: string }[] = [];
  const children = await listDir(sftp, rootPath);
  for (const child of children) {
    const nested = await collectFilesRecursive(sftp, child.path, posixJoin(rootName, child.name));
    out.push(...nested);
  }
  return out;
}

export function createRemoteReadStream(sftp: SFTPWrapper, filePath: string) {
  return sftp.createReadStream(filePath);
}
