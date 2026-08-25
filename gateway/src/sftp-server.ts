import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Server, utils } from "ssh2";
import type { Session, SFTPWrapper, Attributes } from "ssh2";
import { config } from "./config.js";
import { authenticateNasUser } from "./main-api-client.js";
import { mountPointFor } from "./mounts.js";

const { OPEN_MODE, STATUS_CODE } = utils.sftp;

// Gleicher virtueller-Root-Ansatz wie im FTP-Server (siehe dort für die
// Begründung und die bekannte Einschränkung bei granularen Read-Only-Rechten
// pro Freigabe): ein Verzeichnis mit einem Symlink je Freigabe des NAS-Users.

const VIRTUAL_ROOT_BASE = "/tmp/netmaster-nas-sftp-roots";

async function buildVirtualRoot(
  nasUserId: string,
  shares: { shareId: string }[]
): Promise<string> {
  const root = path.join(VIRTUAL_ROOT_BASE, nasUserId);
  await fsp.rm(root, { recursive: true, force: true });
  await fsp.mkdir(root, { recursive: true });
  for (const share of shares) {
    await fsp.symlink(mountPointFor(share.shareId), path.join(root, share.shareId)).catch(() => {});
  }
  return root;
}

function toAttrs(stat: fs.Stats): Attributes {
  return {
    mode: stat.mode,
    uid: stat.uid,
    gid: stat.gid,
    size: stat.size,
    atime: Math.floor(stat.atimeMs / 1000),
    mtime: Math.floor(stat.mtimeMs / 1000),
  };
}

interface OpenHandle {
  fd: number;
  path: string;
}

let handleCounter = 0;

export function startSftpServer(): void {
  const hostKey = fs.readFileSync(config.sftpHostKeyPath);

  const server = new Server({ hostKeys: [hostKey] }, (client) => {
    let virtualRoot: string | null = null;

    client.on("authentication", (ctx) => {
      if (ctx.method !== "password") {
        ctx.reject(["password"]);
        return;
      }
      authenticateNasUser(ctx.username, ctx.password)
        .then(async (result) => {
          if (!result.ok || !result.nasUserId || !result.shares) {
            ctx.reject();
            return;
          }
          virtualRoot = await buildVirtualRoot(result.nasUserId, result.shares);
          ctx.accept();
        })
        .catch(() => ctx.reject());
    });

    client.on("ready", () => {
      client.on("session", (accept: () => Session) => {
        const session = accept();
        session.on("sftp", (accept: () => SFTPWrapper) => {
          const sftp = accept();
          const handles = new Map<string, OpenHandle & { readStream?: fs.ReadStream; writeStream?: fs.WriteStream }>();

          function resolvePath(reqPath: string): string {
            if (!virtualRoot) throw new Error("Not authenticated");
            const normalized = path.normalize(path.join("/", reqPath));
            return path.join(virtualRoot, normalized);
          }

          sftp.on("REALPATH", (reqId, reqPath) => {
            try {
              const resolved = resolvePath(reqPath);
              const relative = "/" + path.relative(virtualRoot!, resolved);
              sftp.name(reqId, [{ filename: relative, longname: relative, attrs: {} as Attributes }]);
            } catch {
              sftp.status(reqId, STATUS_CODE.FAILURE);
            }
          });

          sftp.on("OPENDIR", (reqId, reqPath) => {
            try {
              const resolved = resolvePath(reqPath);
              const handle = `dir:${handleCounter++}`;
              handles.set(handle, { fd: -1, path: resolved });
              sftp.handle(reqId, Buffer.from(handle));
            } catch {
              sftp.status(reqId, STATUS_CODE.NO_SUCH_FILE);
            }
          });

          const dirListed = new Set<string>();
          sftp.on("READDIR", (reqId, handleBuf) => {
            const handle = handleBuf.toString();
            const entry = handles.get(handle);
            if (!entry || dirListed.has(handle)) {
              sftp.status(reqId, STATUS_CODE.EOF);
              return;
            }
            dirListed.add(handle);
            try {
              const names = fs.readdirSync(entry.path);
              const list = names.map((name) => {
                const stat = fs.lstatSync(path.join(entry.path, name));
                return { filename: name, longname: name, attrs: toAttrs(stat) };
              });
              sftp.name(reqId, list);
            } catch {
              sftp.status(reqId, STATUS_CODE.FAILURE);
            }
          });

          sftp.on("LSTAT", (reqId, reqPath) => {
            try {
              const stat = fs.lstatSync(resolvePath(reqPath));
              sftp.attrs(reqId, toAttrs(stat));
            } catch {
              sftp.status(reqId, STATUS_CODE.NO_SUCH_FILE);
            }
          });
          sftp.on("STAT", (reqId, reqPath) => {
            try {
              const stat = fs.statSync(resolvePath(reqPath));
              sftp.attrs(reqId, toAttrs(stat));
            } catch {
              sftp.status(reqId, STATUS_CODE.NO_SUCH_FILE);
            }
          });
          sftp.on("FSTAT", (reqId, handleBuf) => {
            const entry = handles.get(handleBuf.toString());
            if (!entry) {
              sftp.status(reqId, STATUS_CODE.FAILURE);
              return;
            }
            try {
              sftp.attrs(reqId, toAttrs(fs.fstatSync(entry.fd)));
            } catch {
              sftp.status(reqId, STATUS_CODE.FAILURE);
            }
          });

          sftp.on("OPEN", (reqId, reqPath, flags) => {
            try {
              const resolved = resolvePath(reqPath);
              let nodeFlags = "r";
              if (flags & OPEN_MODE.WRITE && flags & OPEN_MODE.CREAT) nodeFlags = "w";
              else if (flags & OPEN_MODE.WRITE) nodeFlags = "r+";
              if (flags & OPEN_MODE.APPEND) nodeFlags = "a";
              const fd = fs.openSync(resolved, nodeFlags);
              const handle = `file:${handleCounter++}`;
              handles.set(handle, { fd, path: resolved });
              sftp.handle(reqId, Buffer.from(handle));
            } catch {
              sftp.status(reqId, STATUS_CODE.FAILURE);
            }
          });

          sftp.on("READ", (reqId, handleBuf, offset, length) => {
            const entry = handles.get(handleBuf.toString());
            if (!entry) {
              sftp.status(reqId, STATUS_CODE.FAILURE);
              return;
            }
            const buffer = Buffer.alloc(length);
            const bytesRead = fs.readSync(entry.fd, buffer, 0, length, offset);
            if (bytesRead === 0) {
              sftp.status(reqId, STATUS_CODE.EOF);
              return;
            }
            sftp.data(reqId, buffer.subarray(0, bytesRead));
          });

          sftp.on("WRITE", (reqId, handleBuf, offset, data) => {
            const entry = handles.get(handleBuf.toString());
            if (!entry) {
              sftp.status(reqId, STATUS_CODE.FAILURE);
              return;
            }
            fs.writeSync(entry.fd, data, 0, data.length, offset);
            sftp.status(reqId, STATUS_CODE.OK);
          });

          sftp.on("CLOSE", (reqId, handleBuf) => {
            const handle = handleBuf.toString();
            const entry = handles.get(handle);
            if (entry?.fd && entry.fd >= 0) fs.closeSync(entry.fd);
            handles.delete(handle);
            dirListed.delete(handle);
            sftp.status(reqId, STATUS_CODE.OK);
          });

          sftp.on("MKDIR", (reqId, reqPath) => {
            try {
              fs.mkdirSync(resolvePath(reqPath), { recursive: true });
              sftp.status(reqId, STATUS_CODE.OK);
            } catch {
              sftp.status(reqId, STATUS_CODE.FAILURE);
            }
          });

          sftp.on("RMDIR", (reqId, reqPath) => {
            try {
              fs.rmdirSync(resolvePath(reqPath));
              sftp.status(reqId, STATUS_CODE.OK);
            } catch {
              sftp.status(reqId, STATUS_CODE.FAILURE);
            }
          });

          sftp.on("REMOVE", (reqId, reqPath) => {
            try {
              fs.unlinkSync(resolvePath(reqPath));
              sftp.status(reqId, STATUS_CODE.OK);
            } catch {
              sftp.status(reqId, STATUS_CODE.FAILURE);
            }
          });

          sftp.on("RENAME", (reqId, oldPath, newPath) => {
            try {
              fs.renameSync(resolvePath(oldPath), resolvePath(newPath));
              sftp.status(reqId, STATUS_CODE.OK);
            } catch {
              sftp.status(reqId, STATUS_CODE.FAILURE);
            }
          });
        });
      });
    });
  });

  server.listen(config.sftpPort, "0.0.0.0", () => {
    console.log(`NAS-Gateway SFTP-Server hört auf Port ${config.sftpPort}`);
  });
}
