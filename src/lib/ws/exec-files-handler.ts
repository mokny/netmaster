import type { WebSocket } from "ws";
import { writeAuditLog } from "@/lib/audit";
import type { SessionPayload } from "@/lib/session-token";
import { ExecFileOpError, type FileBackend } from "@/lib/exec-file-backend";
import type {
  FileManagerClientMessage,
  FileManagerServerMessage,
} from "@/lib/file-manager-types";

// Wie files-handler.ts (echtes SFTP), aber gegen ein Docker-/Proxmox-Backend
// (Shell-Befehle über die Host-SSH-Verbindung statt SFTP-Protokoll) - gleiches
// Client/Server-Nachrichtenprotokoll, damit das bestehende Dateimanager-UI
// unverändert wiederverwendet werden kann.
export async function handleExecFilesSocket(
  ws: WebSocket,
  backend: FileBackend,
  session: SessionPayload,
  auditContext: { serverId: string; detail: string }
) {
  const send = (msg: FileManagerServerMessage) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  const audit = (action: string, detail: string) =>
    void writeAuditLog(session, `files.${action}`, {
      serverId: auditContext.serverId,
      detail: `[${auditContext.detail}] ${detail}`,
    });

  try {
    const home = await backend.homeDir();
    send({ type: "ready", homeDir: home });
  } catch (err) {
    send({
      type: "error",
      code: "CONNECT_FAILED",
      message: err instanceof Error ? err.message : "Verbindung fehlgeschlagen",
    });
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
          const entries = await backend.list(msg.path);
          send({ type: "list-result", reqId: msg.reqId, path: msg.path, entries });
          break;
        }
        case "mkdir": {
          await backend.mkdir(msg.path);
          audit("mkdir", msg.path);
          send({ type: "ok", reqId: msg.reqId });
          break;
        }
        case "touch": {
          await backend.touch(msg.path);
          audit("touch", msg.path);
          send({ type: "ok", reqId: msg.reqId });
          break;
        }
        case "delete": {
          await backend.remove(msg.path);
          audit("delete", msg.path);
          send({ type: "ok", reqId: msg.reqId });
          break;
        }
        case "rename": {
          await backend.rename(msg.from, msg.to);
          audit("rename", `${msg.from} -> ${msg.to}`);
          send({ type: "ok", reqId: msg.reqId });
          break;
        }
        case "copy": {
          await backend.copy(msg.from, msg.to);
          audit("copy", `${msg.from} -> ${msg.to}`);
          send({ type: "ok", reqId: msg.reqId });
          break;
        }
        case "move": {
          await backend.move(msg.from, msg.to);
          audit("move", `${msg.from} -> ${msg.to}`);
          send({ type: "ok", reqId: msg.reqId });
          break;
        }
        case "chmod": {
          const mode = parseInt(msg.mode, 8);
          if (Number.isNaN(mode)) throw new ExecFileOpError("Invalid mode", "OTHER");
          await backend.chmod(msg.path, mode);
          audit("chmod", `${msg.path} -> ${msg.mode}`);
          send({ type: "ok", reqId: msg.reqId });
          break;
        }
        case "chown": {
          await backend.chown(msg.path, msg.uid, msg.gid);
          audit("chown", `${msg.path} -> uid=${msg.uid} gid=${msg.gid}`);
          send({ type: "ok", reqId: msg.reqId });
          break;
        }
        case "readFile": {
          const content = await backend.readFileText(msg.path);
          send({ type: "read-result", reqId: msg.reqId, content });
          break;
        }
        case "writeFile": {
          await backend.writeFileText(msg.path, msg.content);
          audit("save", msg.path);
          send({ type: "ok", reqId: msg.reqId });
          break;
        }
      }
    } catch (err) {
      const code = err instanceof ExecFileOpError ? err.code : "OTHER";
      send({
        type: "error",
        reqId: msg.reqId,
        code,
        message: err instanceof Error ? err.message : "Aktion fehlgeschlagen",
      });
    }
  });
}
