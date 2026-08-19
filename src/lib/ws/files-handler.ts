import type { WebSocket } from "ws";
import { prisma } from "@/lib/prisma";
import { openSftpSession } from "@/lib/ssh";
import { writeAuditLog } from "@/lib/audit";
import type { SessionPayload } from "@/lib/session-token";
import {
  homeDir,
  listDir,
  mkdir,
  touch,
  renamePath,
  chmodPath,
  chownPath,
  removeRecursive,
  readFileText,
  writeFileText,
  copyRecursive,
  movePath,
  assertNotExists,
  SftpOpError,
} from "@/lib/sftp-ops";
import type {
  FileManagerClientMessage,
  FileManagerServerMessage,
} from "@/lib/file-manager-types";

// Eine persistente SFTP-Session pro geöffnetem Dateimanager-Panel. Schreibende
// Aktionen werden auditiert (nur Pfad, keine Dateiinhalte).
export async function handleFilesSocket(
  ws: WebSocket,
  serverId: string,
  session: SessionPayload
) {
  const send = (msg: FileManagerServerMessage) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) {
    send({ type: "error", code: "NOT_FOUND", message: "Server nicht gefunden" });
    ws.close();
    return;
  }

  let session_: Awaited<ReturnType<typeof openSftpSession>> | null = null;
  try {
    session_ = await openSftpSession(server);
  } catch (err) {
    send({
      type: "error",
      code: "CONNECT_FAILED",
      message: err instanceof Error ? err.message : "SFTP-Verbindung fehlgeschlagen",
    });
    ws.close();
    return;
  }

  const { conn, sftp } = session_;
  const audit = (action: string, detail: string) =>
    void writeAuditLog(session, `files.${action}`, { serverId, detail });

  try {
    const home = await homeDir(sftp);
    send({ type: "ready", homeDir: home });
  } catch {
    send({ type: "ready", homeDir: "/" });
  }

  ws.on("message", async (raw, isBinary) => {
    if (isBinary) return;
    let msg: FileManagerClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    try {
      switch (msg.type) {
        case "list": {
          const entries = await listDir(sftp, msg.path);
          send({ type: "list-result", reqId: msg.reqId, path: msg.path, entries });
          break;
        }
        case "mkdir": {
          await assertNotExists(sftp, msg.path);
          await mkdir(sftp, msg.path);
          audit("mkdir", msg.path);
          send({ type: "ok", reqId: msg.reqId });
          break;
        }
        case "touch": {
          await assertNotExists(sftp, msg.path);
          await touch(sftp, msg.path);
          audit("touch", msg.path);
          send({ type: "ok", reqId: msg.reqId });
          break;
        }
        case "delete": {
          await removeRecursive(sftp, msg.path);
          audit("delete", msg.path);
          send({ type: "ok", reqId: msg.reqId });
          break;
        }
        case "rename": {
          await assertNotExists(sftp, msg.to);
          await renamePath(sftp, msg.from, msg.to);
          audit("rename", `${msg.from} -> ${msg.to}`);
          send({ type: "ok", reqId: msg.reqId });
          break;
        }
        case "copy": {
          await assertNotExists(sftp, msg.to);
          await copyRecursive(sftp, msg.from, msg.to);
          audit("copy", `${msg.from} -> ${msg.to}`);
          send({ type: "ok", reqId: msg.reqId });
          break;
        }
        case "move": {
          await assertNotExists(sftp, msg.to);
          await movePath(sftp, msg.from, msg.to);
          audit("move", `${msg.from} -> ${msg.to}`);
          send({ type: "ok", reqId: msg.reqId });
          break;
        }
        case "chmod": {
          const mode = parseInt(msg.mode, 8);
          if (Number.isNaN(mode)) throw new SftpOpError("Ungültiger Modus", "OTHER");
          await chmodPath(sftp, msg.path, mode);
          audit("chmod", `${msg.path} -> ${msg.mode}`);
          send({ type: "ok", reqId: msg.reqId });
          break;
        }
        case "chown": {
          await chownPath(sftp, msg.path, msg.uid, msg.gid);
          audit("chown", `${msg.path} -> uid=${msg.uid} gid=${msg.gid}`);
          send({ type: "ok", reqId: msg.reqId });
          break;
        }
        case "readFile": {
          const content = await readFileText(sftp, msg.path);
          send({ type: "read-result", reqId: msg.reqId, content });
          break;
        }
        case "writeFile": {
          await writeFileText(sftp, msg.path, msg.content);
          audit("save", msg.path);
          send({ type: "ok", reqId: msg.reqId });
          break;
        }
      }
    } catch (err) {
      const code = err instanceof SftpOpError ? err.code : "OTHER";
      send({
        type: "error",
        reqId: msg.reqId,
        code,
        message: err instanceof Error ? err.message : "Aktion fehlgeschlagen",
      });
    }
  });

  const cleanup = () => {
    try {
      conn.end();
    } catch {
      // ignore
    }
  };
  ws.on("close", cleanup);
  ws.on("error", cleanup);
  conn.on("error", (err) => {
    send({ type: "error", code: "CONNECTION", message: err.message });
  });
}
