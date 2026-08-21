import path from "node:path";
import type { Server as ServerModel } from "@/generated/prisma/client";
import { execOnServer, shellQuote, buildRootCommand } from "@/lib/ssh";
import type { FileNode } from "@/lib/sftp-ops";
import { ExecFileOpError, MAX_EDITABLE_BYTES, type FileBackend } from "@/lib/exec-file-backend";

const MAX_TRANSFER_BYTES = 50 * 1024 * 1024;

function posixJoin(dir: string, name: string): string {
  return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

interface GuestExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

// Führt ein Skript per QEMU-Guest-Agent aus ('qm guest-exec --timeout', das
// synchron auf das Ergebnis wartet und es als JSON mit base64-kodierten
// out-data/err-data zurückgibt). Setzt voraus, dass der Guest-Agent im Gast
// läuft - andernfalls schlägt der Befehl mit einer klaren Fehlermeldung fehl.
async function runGuestScript(
  server: ServerModel,
  vmid: number,
  script: string,
  args: string[],
  opts: { stdin?: string; timeoutMs?: number } = {}
): Promise<GuestExecResult> {
  const timeoutSec = Math.max(5, Math.round((opts.timeoutMs ?? 20_000) / 1000));
  const parts = [
    "qm",
    "guest-exec",
    String(vmid),
    "--timeout",
    String(timeoutSec),
    "--",
    "sh",
    "-c",
    script,
    "sh",
    ...args,
  ];
  const baseCommand = parts.map(shellQuote).join(" ");
  const { command, stdin } = buildRootCommand(server, baseCommand);
  const combinedStdin = stdin !== undefined ? `${stdin}${opts.stdin ?? ""}` : opts.stdin;
  const res = await execOnServer(server, command, timeoutSec * 1000 + 10_000, combinedStdin);

  if (res.code !== 0 || !res.stdout.trim()) {
    throw new ExecFileOpError(
      res.stderr.includes("QEMU guest agent is not running") || res.stderr.includes("No QEMU guest agent")
        ? "QEMU-Guest-Agent nicht verfügbar"
        : res.stderr || "Guest-Exec fehlgeschlagen",
      "OTHER"
    );
  }

  try {
    const parsed = JSON.parse(res.stdout) as {
      exited?: number;
      exitcode?: number;
      ["out-data"]?: string;
      ["err-data"]?: string;
    };
    return {
      stdout: parsed["out-data"] ? Buffer.from(parsed["out-data"], "base64").toString("utf8") : "",
      stderr: parsed["err-data"] ? Buffer.from(parsed["err-data"], "base64").toString("utf8") : "",
      code: parsed.exitcode ?? (parsed.exited ? 0 : null),
    };
  } catch {
    throw new ExecFileOpError("Unerwartete Antwort vom Guest-Agent", "OTHER");
  }
}

export function createQemuGuestBackend(server: ServerModel, vmid: number): FileBackend {
  const run = (script: string, args: string[], opts: { stdin?: string; timeoutMs?: number } = {}) =>
    runGuestScript(server, vmid, script, args, opts);

  async function statRaw(filePath: string): Promise<{ mode: number; size: number } | null> {
    const res = await run('stat -c "%f|%s" "$1" 2>/dev/null', [filePath]);
    const line = res.stdout.trim();
    if (res.code !== 0 || !line) return null;
    const [modeHex, sizeStr] = line.split("|");
    return { mode: parseInt(modeHex, 16), size: Number(sizeStr) || 0 };
  }

  const backend: FileBackend = {
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
      if (res.code !== 0) throw new ExecFileOpError(res.stderr || "Löschen fehlgeschlagen", "OTHER");
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
      if (info.size > MAX_EDITABLE_BYTES) throw new ExecFileOpError("Datei ist zu groß zum Bearbeiten", "TOO_LARGE");
      const res = await run('base64 "$1" 2>/dev/null', [filePath]);
      if (res.code !== 0) throw new ExecFileOpError(res.stderr || "Datei konnte nicht gelesen werden", "OTHER");
      const buf = Buffer.from(res.stdout.replace(/\n/g, ""), "base64");
      if (buf.subarray(0, 8000).includes(0)) throw new ExecFileOpError("Datei scheint binär zu sein", "BINARY");
      return buf.toString("utf8");
    },

    async writeFileText(filePath, content) {
      await backend.writeFileBuffer(filePath, Buffer.from(content, "utf8"));
    },

    async readFileBuffer(filePath) {
      const info = await statRaw(filePath);
      if (!info) throw new ExecFileOpError("Nicht gefunden", "NOT_FOUND");
      if ((info.mode & 0xf000) === 0x4000) throw new ExecFileOpError("Ist ein Verzeichnis", "IS_DIR");
      if (info.size > MAX_TRANSFER_BYTES) throw new ExecFileOpError("Datei ist zu groß für den Transfer", "TOO_LARGE");
      const res = await run('base64 "$1" 2>/dev/null', [filePath], { timeoutMs: 60_000 });
      if (res.code !== 0) throw new ExecFileOpError(res.stderr || "Datei konnte nicht gelesen werden", "OTHER");
      return Buffer.from(res.stdout.replace(/\n/g, ""), "base64");
    },

    async writeFileBuffer(filePath, data) {
      if (data.length > MAX_TRANSFER_BYTES) throw new ExecFileOpError("Datei ist zu groß für den Transfer", "TOO_LARGE");
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
      const children = await backend.list(rootPath);
      for (const child of children) {
        const nested = await backend.collectFilesRecursive(child.path, posixJoin(rootName, child.name));
        out.push(...nested);
      }
      return out;
    },
  };

  return backend;
}
