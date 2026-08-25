import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { mountPointFor } from "./mounts.js";
import { setSambaPassword } from "./samba.js";

// Resolved Pfad innerhalb des Mountpoints - wirft, falls der angeforderte
// Pfad (nach Normalisierung) den Mountpoint verlassen würde (Path Traversal).
function resolveSafePath(shareId: string, requestedPath: string): string {
  const mountPoint = mountPointFor(shareId);
  const normalized = path.normalize(path.join("/", requestedPath));
  const resolved = path.join(mountPoint, normalized);
  if (resolved !== mountPoint && !resolved.startsWith(mountPoint + path.sep)) {
    throw new Error("INVALID_PATH");
  }
  return resolved;
}

function checkSecret(req: http.IncomingMessage): boolean {
  return req.headers["x-internal-secret"] === config.internalSecret;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

async function handleFilesRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  shareId: string,
  url: URL
): Promise<void> {
  const op = url.searchParams.get("op") ?? (req.method === "DELETE" ? "delete" : "list");

  try {
    if (req.method === "GET" && op === "list") {
      const dirPath = resolveSafePath(shareId, url.searchParams.get("path") ?? "/");
      const names = await fsp.readdir(dirPath, { withFileTypes: true });
      const entries = await Promise.all(
        names.map(async (entry) => {
          const entryPath = path.join(dirPath, entry.name);
          const stat = await fsp.lstat(entryPath).catch(() => null);
          return {
            name: entry.name,
            path: path.join(url.searchParams.get("path") ?? "/", entry.name),
            isDirectory: entry.isDirectory(),
            isSymlink: entry.isSymbolicLink(),
            size: stat?.size ?? 0,
            mode: stat?.mode ?? 0,
            mtime: stat ? Math.floor(stat.mtimeMs) : 0,
          };
        })
      );
      sendJson(res, 200, { entries });
      return;
    }

    if (req.method === "GET" && op === "read") {
      const filePath = resolveSafePath(shareId, url.searchParams.get("path") ?? "/");
      const stat = await fsp.stat(filePath);
      res.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-length": stat.size,
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    if (req.method === "POST" && op === "write") {
      const filePath = resolveSafePath(shareId, url.searchParams.get("path") ?? "/");
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      const body = await readBody(req);
      await fsp.writeFile(filePath, body);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && op === "mkdir") {
      const dirPath = resolveSafePath(shareId, url.searchParams.get("path") ?? "/");
      await fsp.mkdir(dirPath, { recursive: true });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && (op === "rename" || op === "move")) {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const from = resolveSafePath(shareId, body.from ?? "");
      const to = resolveSafePath(shareId, body.to ?? "");
      await fsp.rename(from, to);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "DELETE") {
      const targetPath = resolveSafePath(shareId, url.searchParams.get("path") ?? "/");
      await fsp.rm(targetPath, { recursive: true, force: true });
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 400, { error: "UNKNOWN_OPERATION" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === "INVALID_PATH" ? 400 : 500;
    sendJson(res, status, { error: "FILE_OPERATION_FAILED", detail: message });
  }
}

export function startFilesApiServer(): void {
  const server = http.createServer(async (req, res) => {
    if (!checkSecret(req)) {
      sendJson(res, 401, { error: "UNAUTHORIZED" });
      return;
    }

    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname === "/internal/samba-password" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      await setSambaPassword(body.email, body.password).catch((err) => {
        console.error("Samba-Passwort-Sync fehlgeschlagen:", err);
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    const match = url.pathname.match(/^\/files\/([^/]+)$/);
    if (match) {
      await handleFilesRequest(req, res, match[1], url);
      return;
    }

    sendJson(res, 404, { error: "NOT_FOUND" });
  });

  server.listen(config.filesApiPort, () => {
    console.log(`NAS-Gateway Datei-API hört auf Port ${config.filesApiPort}`);
  });
}
