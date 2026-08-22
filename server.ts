import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import {
  verifySessionToken,
  SESSION_COOKIE,
  type SessionPayload,
} from "./src/lib/session-token";
import { monitorEvents, type MonitorEvent } from "./src/lib/monitor/events";
import { startMonitorScheduler } from "./src/lib/monitor/scheduler";
import { ensureVapidKeys } from "./src/lib/push";
import { handleTerminalSocket } from "./src/lib/ws/terminal-handler";
import { handleAdhocTerminalSocket } from "./src/lib/ws/adhoc-terminal-handler";
import { handleVmTerminalSocket } from "./src/lib/ws/vm-terminal-handler";
import { handleVmVncSocket } from "./src/lib/ws/vm-vnc-handler";
import { handleDockerTerminalSocket } from "./src/lib/ws/docker-terminal-handler";
import { handleProcessesSocket } from "./src/lib/ws/processes-handler";
import { handleDetailPresenceSocket, type DetailPresenceKind } from "./src/lib/ws/detail-presence-handler";
import { handleFilesSocket } from "./src/lib/ws/files-handler";
import { handleExecFilesSocket } from "./src/lib/ws/exec-files-handler";
import { resolveDockerFileBackend, resolveProxmoxFileBackend } from "./src/lib/exec-file-target";

const roleRank: Record<SessionPayload["role"], number> = {
  VIEWER: 0,
  EDITOR: 1,
  ADMIN: 2,
};

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev });
const handle = app.getRequestHandler();

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const match = header
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(name.length + 1));
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });
  const terminalWss = new WebSocketServer({ noServer: true });
  const adhocTerminalWss = new WebSocketServer({ noServer: true });
  const vmTerminalWss = new WebSocketServer({ noServer: true });
  const vmVncWss = new WebSocketServer({ noServer: true });
  const dockerTerminalWss = new WebSocketServer({ noServer: true });
  const processesWss = new WebSocketServer({ noServer: true });
  const detailPresenceWss = new WebSocketServer({ noServer: true });
  const filesWss = new WebSocketServer({ noServer: true });
  const dockerFilesWss = new WebSocketServer({ noServer: true });
  const proxmoxFilesWss = new WebSocketServer({ noServer: true });
  const clients = new Set<WebSocket>();

  const nextUpgradeHandler = app.getUpgradeHandler();

  httpServer.on("upgrade", async (req, socket, head) => {
    const { pathname, query } = parse(req.url ?? "/", true);

    if (
      pathname !== "/api/ws" &&
      pathname !== "/api/ws/terminal" &&
      pathname !== "/api/ws/adhoc-terminal" &&
      pathname !== "/api/ws/vm-terminal" &&
      pathname !== "/api/ws/vm-vnc" &&
      pathname !== "/api/ws/docker-terminal" &&
      pathname !== "/api/ws/processes" &&
      pathname !== "/api/ws/detail-presence" &&
      pathname !== "/api/ws/files" &&
      pathname !== "/api/ws/docker-files" &&
      pathname !== "/api/ws/proxmox-files"
    ) {
      nextUpgradeHandler(req, socket, head);
      return;
    }

    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    const session = token ? await verifySessionToken(token) : null;
    if (!session) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    if (pathname === "/api/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        clients.add(ws);
        ws.on("close", () => clients.delete(ws));
      });
      return;
    }

    // Reiner Präsenz-Signal-Socket (siehe detail-presence-handler.ts) - keine
    // Shell-/Dateisystem-Zugriffsrechte nötig, daher nicht auf Editor+
    // beschränkt wie der Block darunter.
    if (pathname === "/api/ws/detail-presence") {
      const serverId = typeof query.serverId === "string" ? query.serverId : null;
      const kind = typeof query.kind === "string" ? query.kind : null;
      if (!serverId || (kind !== "proxmox" && kind !== "docker")) {
        socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        socket.destroy();
        return;
      }
      detailPresenceWss.handleUpgrade(req, socket, head, (ws) => {
        handleDetailPresenceSocket(ws, serverId, kind as DetailPresenceKind);
      });
      return;
    }

    // Terminal-Zugriff, Prozessmanager und Dateimanager sind sicherheitskritisch
    // (voller Shell-/Dateisystemzugriff bzw. Kill-Rechte) und daher auf Editor+
    // beschränkt.
    if (roleRank[session.role] < roleRank.EDITOR) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    if (pathname === "/api/ws/adhoc-terminal") {
      const ticket = typeof query.ticket === "string" ? query.ticket : "";
      if (!/^[a-f0-9]{48}$/.test(ticket)) {
        socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        socket.destroy();
        return;
      }
      adhocTerminalWss.handleUpgrade(req, socket, head, (ws) => {
        void handleAdhocTerminalSocket(ws, ticket, session);
      });
      return;
    }

    const serverId = typeof query.serverId === "string" ? query.serverId : null;
    if (!serverId) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    if (pathname === "/api/ws/terminal") {
      terminalWss.handleUpgrade(req, socket, head, (ws) => {
        void handleTerminalSocket(ws, serverId, session);
      });
      return;
    }

    if (pathname === "/api/ws/vm-terminal") {
      const vmid = Number(query.vmid);
      if (!Number.isInteger(vmid)) {
        socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        socket.destroy();
        return;
      }
      vmTerminalWss.handleUpgrade(req, socket, head, (ws) => {
        void handleVmTerminalSocket(ws, serverId, vmid, session);
      });
      return;
    }

    if (pathname === "/api/ws/vm-vnc") {
      const vmid = Number(query.vmid);
      const ticket = typeof query.ticket === "string" ? query.ticket : "";
      if (!Number.isInteger(vmid) || !/^[a-zA-Z0-9]{16,64}$/.test(ticket)) {
        socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        socket.destroy();
        return;
      }
      vmVncWss.handleUpgrade(req, socket, head, (ws) => {
        void handleVmVncSocket(ws, serverId, vmid, ticket, session);
      });
      return;
    }

    if (pathname === "/api/ws/docker-terminal") {
      const containerId = typeof query.containerId === "string" ? query.containerId : "";
      if (!containerId) {
        socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        socket.destroy();
        return;
      }
      dockerTerminalWss.handleUpgrade(req, socket, head, (ws) => {
        void handleDockerTerminalSocket(ws, serverId, containerId, session);
      });
      return;
    }

    if (pathname === "/api/ws/processes") {
      processesWss.handleUpgrade(req, socket, head, (ws) => {
        void handleProcessesSocket(ws, serverId);
      });
      return;
    }

    if (pathname === "/api/ws/docker-files") {
      const containerId = typeof query.containerId === "string" ? query.containerId : "";
      if (!containerId) {
        socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        socket.destroy();
        return;
      }
      dockerFilesWss.handleUpgrade(req, socket, head, (ws) => {
        void (async () => {
          try {
            const { backend, detail } = await resolveDockerFileBackend(serverId, containerId);
            void handleExecFilesSocket(ws, backend, session, { serverId, detail });
          } catch {
            ws.close();
          }
        })();
      });
      return;
    }

    if (pathname === "/api/ws/proxmox-files") {
      const vmid = Number(query.vmid);
      if (!Number.isInteger(vmid)) {
        socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        socket.destroy();
        return;
      }
      proxmoxFilesWss.handleUpgrade(req, socket, head, (ws) => {
        void (async () => {
          try {
            const { backend, detail } = await resolveProxmoxFileBackend(serverId, vmid);
            void handleExecFilesSocket(ws, backend, session, { serverId, detail });
          } catch {
            ws.close();
          }
        })();
      });
      return;
    }

    filesWss.handleUpgrade(req, socket, head, (ws) => {
      void handleFilesSocket(ws, serverId, session);
    });
  });

  const onEvent = (event: MonitorEvent) => {
    const payload = JSON.stringify(event);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  };
  monitorEvents.on("event", onEvent);

  void ensureVapidKeys().catch((err) => {
    console.error("VAPID-Schlüssel konnten nicht geladen/erzeugt werden:", err);
  });

  startMonitorScheduler();

  httpServer.listen(port, () => {
    console.log(`> NetMaster läuft auf http://localhost:${port}`);
  });
});
