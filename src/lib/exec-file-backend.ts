import path from "node:path";
import type { Server as ServerModel } from "@/generated/prisma/client";
import { execOnServer, shellQuote, buildRootCommand } from "@/lib/ssh";
import type { FileNode } from "@/lib/sftp-ops";

export class ExecFileOpError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "EXISTS" | "IS_DIR" | "NOT_DIR" | "TOO_LARGE" | "BINARY" | "OTHER" = "OTHER"
  ) {
    super(message);
  }
}

export const MAX_EDITABLE_BYTES = 3 * 1024 * 1024;
// Größenlimit für Up-/Download über den Base64-Umweg (exec liefert nur
// Text-Stdout, kein echter Byte-Stream) - bewusst kleiner als bei SFTP.
const MAX_TRANSFER_BYTES = 50 * 1024 * 1024;

function posixJoin(dir: string, name: string): string {
  return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

// Führt ein Shell-Skript im Zielkontext (Container/LXC) aus. Das Skript
// bekommt seine Argumente sauber als $1, $2, ... übergeben (kein
// String-Interpolieren von Pfaden in den Skripttext), `exec` ist der Präfix-
// Befehl (z.B. ["docker","exec","-i",id] oder ["pct","exec",String(vmid),"--"]).
async function runScript(
  server: ServerModel,
  exec: string[],
  script: string,
  args: string[],
  opts: { root?: boolean; stdin?: string; timeoutMs?: number } = {}
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const parts = [...exec, "sh", "-c", script, "sh", ...args];
  const baseCommand = parts.map(shellQuote).join(" ");
  const { command, stdin } = opts.root
    ? buildRootCommand(server, baseCommand)
    : { command: baseCommand, stdin: undefined };
  const combinedStdin = stdin !== undefined ? `${stdin}${opts.stdin ?? ""}` : opts.stdin;
  return execOnServer(server, command, opts.timeoutMs ?? 20_000, combinedStdin);
}

export interface FileBackend {
  homeDir(): Promise<string>;
  list(dirPath: string): Promise<FileNode[]>;
  mkdir(dirPath: string): Promise<void>;
  touch(filePath: string): Promise<void>;
  remove(targetPath: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  chmod(filePath: string, mode: number): Promise<void>;
  chown(filePath: string, uid: number, gid: number): Promise<void>;
  readFileText(filePath: string): Promise<string>;
  writeFileText(filePath: string, content: string): Promise<void>;
  statSize(filePath: string): Promise<{ isDirectory: boolean; size: number }>;
  readFileBuffer(filePath: string): Promise<Buffer>;
  writeFileBuffer(filePath: string, data: Buffer): Promise<void>;
  collectFilesRecursive(
    rootPath: string,
    rootName: string
  ): Promise<{ absPath: string; relPath: string }[]>;
}

// Datei-Backend über `docker exec`/`pct exec` (Shell-Befehle im Container/LXC,
// über die vorhandene Host-SSH-Verbindung) statt echtem SFTP. `stat -c` wird
// sowohl von GNU coreutils als auch BusyBox unterstützt.
export function createExecFileBackend(
  server: ServerModel,
  exec: string[],
  requiresRoot: boolean
): FileBackend {
  const run = (script: string, args: string[], opts: { stdin?: string; timeoutMs?: number } = {}) =>
    runScript(server, exec, script, args, { root: requiresRoot, ...opts });

  async function statRaw(filePath: string): Promise<{ mode: number; size: number } | null> {
    const res = await run('stat -c "%f|%s" "$1" 2>/dev/null', [filePath]);
    const line = res.stdout.trim();
    if (res.code !== 0 || !line) return null;
    const [modeHex, sizeStr] = line.split("|");
    return { mode: parseInt(modeHex, 16), size: Number(sizeStr) || 0 };
  }

  return {
    async homeDir() {
      const res = await run('printf "%s" "${HOME:-/}"', []);
      return res.stdout.trim() || "/";
    },

    async list(dirPath) {
      const res = await run(
        'cd "$1" 2>/dev/null || exit 3; for f in * .[!.]*; do [ -e "$f" ] || [ -L "$f" ] || continue; stat -c "%f|%s|%Y|%n" "$f" 2>/dev/null; done',
        [dirPath]
      );
      if (res.code === 3) throw new ExecFileOpError("Verzeichnis nicht gefunden", "NOT_FOUND");
      const nodes: FileNode[] = [];
      for (const line of res.stdout.split("\n")) {
        if (!line.trim()) continue;
        const [modeHex, sizeStr, mtimeStr, name] = line.split("|");
        if (!name || name === "." || name === "..") continue;
        const mode = parseInt(modeHex, 16);
        nodes.push({
          name,
          path: posixJoin(dirPath, name),
          isDirectory: (mode & 0xf000) === 0x4000,
          isSymlink: (mode & 0xf000) === 0xa000,
          size: Number(sizeStr) || 0,
          mode,
          mtime: (Number(mtimeStr) || 0) * 1000,
        });
      }
      nodes.sort((a, b) =>
        a.isDirectory === b.isDirectory
          ? a.name.localeCompare(b.name)
          : a.isDirectory
            ? -1
            : 1
      );
      return nodes;
    },

    async mkdir(dirPath) {
      const res = await run('[ -e "$1" ] && exit 4; mkdir "$1"', [dirPath]);
      if (res.code === 4) throw new ExecFileOpError(`"${path.posix.basename(dirPath)}" existiert bereits`, "EXISTS");
      if (res.code !== 0) throw new ExecFileOpError(res.stderr || "Ordner konnte nicht erstellt werden", "OTHER");
    },

    async touch(filePath) {
      const res = await run('[ -e "$1" ] && exit 4; : > "$1"', [filePath]);
      if (res.code === 4) throw new ExecFileOpError(`"${path.posix.basename(filePath)}" existiert bereits`, "EXISTS");
      if (res.code !== 0) throw new ExecFileOpError(res.stderr || "Datei konnte nicht erstellt werden", "OTHER");
    },

    async remove(targetPath) {
      const res = await run('rm -rf "$1"', [targetPath]);
      if (res.code !== 0) throw new ExecFileOpError(res.stderr || "Delete failed", "OTHER");
    },

    async rename(from, to) {
      const res = await run('[ -e "$2" ] && exit 4; mv "$1" "$2"', [from, to]);
      if (res.code === 4) throw new ExecFileOpError(`"${path.posix.basename(to)}" existiert bereits`, "EXISTS");
      if (res.code !== 0) throw new ExecFileOpError(res.stderr || "Umbenennen fehlgeschlagen", "OTHER");
    },

    async copy(from, to) {
      const res = await run('[ -e "$2" ] && exit 4; cp -r "$1" "$2"', [from, to]);
      if (res.code === 4) throw new ExecFileOpError(`"${path.posix.basename(to)}" existiert bereits`, "EXISTS");
      if (res.code !== 0) throw new ExecFileOpError(res.stderr || "Kopieren fehlgeschlagen", "OTHER");
    },

    async move(from, to) {
      const res = await run('[ -e "$2" ] && exit 4; mv "$1" "$2"', [from, to]);
      if (res.code === 4) throw new ExecFileOpError(`"${path.posix.basename(to)}" existiert bereits`, "EXISTS");
      if (res.code !== 0) throw new ExecFileOpError(res.stderr || "Verschieben fehlgeschlagen", "OTHER");
    },

    async chmod(filePath, mode) {
      const octal = (mode & 0o7777).toString(8);
      const res = await run('chmod "$2" "$1"', [filePath, octal]);
      if (res.code !== 0) throw new ExecFileOpError(res.stderr || "chmod fehlgeschlagen", "OTHER");
    },

    async chown(filePath, uid, gid) {
      const res = await run('chown "$2:$3" "$1"', [filePath, String(uid), String(gid)]);
      if (res.code !== 0) throw new ExecFileOpError(res.stderr || "chown fehlgeschlagen", "OTHER");
    },

    async statSize(filePath) {
      const info = await statRaw(filePath);
      if (!info) throw new ExecFileOpError("Nicht gefunden", "NOT_FOUND");
      return { isDirectory: (info.mode & 0xf000) === 0x4000, size: info.size };
    },

    async readFileText(filePath) {
      const info = await statRaw(filePath);
      if (!info) throw new ExecFileOpError("Nicht gefunden", "NOT_FOUND");
      if ((info.mode & 0xf000) === 0x4000) throw new ExecFileOpError("Ist ein Verzeichnis", "IS_DIR");
      if (info.size > MAX_EDITABLE_BYTES) throw new ExecFileOpError("File is too large to edit", "TOO_LARGE");
      const res = await run('base64 "$1" 2>/dev/null', [filePath]);
      if (res.code !== 0) throw new ExecFileOpError(res.stderr || "Datei konnte nicht gelesen werden", "OTHER");
      const buf = Buffer.from(res.stdout.replace(/\n/g, ""), "base64");
      if (buf.subarray(0, 8000).includes(0)) throw new ExecFileOpError("File appears to be binary", "BINARY");
      return buf.toString("utf8");
    },

    async writeFileText(filePath, content) {
      await this.writeFileBuffer(filePath, Buffer.from(content, "utf8"));
    },

    async readFileBuffer(filePath) {
      const info = await statRaw(filePath);
      if (!info) throw new ExecFileOpError("Nicht gefunden", "NOT_FOUND");
      if ((info.mode & 0xf000) === 0x4000) throw new ExecFileOpError("Ist ein Verzeichnis", "IS_DIR");
      if (info.size > MAX_TRANSFER_BYTES) throw new ExecFileOpError("File is too large to transfer", "TOO_LARGE");
      const res = await run('base64 "$1" 2>/dev/null', [filePath], { timeoutMs: 60_000 });
      if (res.code !== 0) throw new ExecFileOpError(res.stderr || "Datei konnte nicht gelesen werden", "OTHER");
      return Buffer.from(res.stdout.replace(/\n/g, ""), "base64");
    },

    async writeFileBuffer(filePath, data) {
      if (data.length > MAX_TRANSFER_BYTES) throw new ExecFileOpError("File is too large to transfer", "TOO_LARGE");
      const res = await run('base64 -d > "$1"', [filePath], {
        stdin: data.toString("base64"),
        timeoutMs: 60_000,
      });
      if (res.code !== 0) throw new ExecFileOpError(res.stderr || "Schreiben fehlgeschlagen", "OTHER");
    },

    async collectFilesRecursive(rootPath, rootName) {
      const info = await statRaw(rootPath);
      if (!info) throw new ExecFileOpError("Nicht gefunden", "NOT_FOUND");
      if ((info.mode & 0xf000) !== 0x4000) return [{ absPath: rootPath, relPath: rootName }];
      const out: { absPath: string; relPath: string }[] = [];
      const children = await this.list(rootPath);
      for (const child of children) {
        const nested = await this.collectFilesRecursive(child.path, posixJoin(rootName, child.name));
        out.push(...nested);
      }
      return out;
    },
  };
}
