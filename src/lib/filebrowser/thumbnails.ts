import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp"]);

export function isThumbnailableExtension(name: string): boolean {
  const ext = path.extname(name).slice(1).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

// Leitet das beschreibbare Datenverzeichnis der App aus DATABASE_URL ab
// (Format "file:/app/data/netmaster.db" in Produktion, in Dev meist ein
// relativer Pfad wie "file:./prisma/dev.db") - fällt auf ein "data"-Verzeichnis
// unter cwd zurück, falls das Parsen scheitert.
function resolveDataDir(): string {
  const url = process.env.DATABASE_URL ?? "";
  const match = url.match(/^file:(.+)$/);
  if (match) {
    const raw = match[1];
    const abs = path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
    return path.dirname(abs);
  }
  return path.join(process.cwd(), "data");
}

const THUMB_DIR = path.join(resolveDataDir(), "filebrowser-thumbnails");

let dirEnsured = false;
async function ensureThumbDir(): Promise<void> {
  if (dirEnsured) return;
  await fs.mkdir(THUMB_DIR, { recursive: true });
  dirEnsured = true;
}

// Cache-Key aus (serverId, username, sharePath, mtimeMs): eine veränderte
// Datei (neue mtime) erzeugt automatisch einen neuen Cache-Eintrag, statt
// einen veralteten Thumbnail-Inhalt auszuliefern.
function cacheFileName(serverId: string, username: string, sharePath: string, mtimeMs: number): string {
  const hash = crypto
    .createHash("sha256")
    .update(`${serverId}:${username}:${sharePath}:${mtimeMs}`)
    .digest("hex");
  return `${hash}.jpg`;
}

export async function getCachedThumbnail(
  serverId: string,
  username: string,
  sharePath: string,
  mtimeMs: number
): Promise<Buffer | null> {
  await ensureThumbDir();
  const file = path.join(THUMB_DIR, cacheFileName(serverId, username, sharePath, mtimeMs));
  try {
    return await fs.readFile(file);
  } catch {
    return null;
  }
}

// Erzeugt ein ~200px-JPEG-Thumbnail (längste Kante) aus dem Quell-Buffer und
// legt es lokal auf dem NetMaster-Host ab (NICHT auf dem Zielserver).
export async function generateAndCacheThumbnail(
  serverId: string,
  username: string,
  sharePath: string,
  mtimeMs: number,
  sourceBuffer: Buffer
): Promise<Buffer> {
  await ensureThumbDir();
  const resized = await sharp(sourceBuffer)
    .rotate()
    .resize({ width: 200, height: 200, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  const file = path.join(THUMB_DIR, cacheFileName(serverId, username, sharePath, mtimeMs));
  await fs.writeFile(file, resized);
  return resized;
}
