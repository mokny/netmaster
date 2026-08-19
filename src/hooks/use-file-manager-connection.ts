"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  FileManagerClientMessage,
  FileManagerServerMessage,
  FileNodeDTO,
  DistributiveOmit,
} from "@/lib/file-manager-types";

export type ConnectionStatus = "connecting" | "open" | "closed" | "error";

interface Pending {
  resolve: (msg: FileManagerServerMessage) => void;
  reject: (err: Error) => void;
}

export class FileOpError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

// Eine persistente WebSocket/SFTP-Session für ein Dateimanager-Panel. Jede
// Anfrage bekommt eine reqId und wird über ein Promise aufgelöst (RPC über WS).
export function useFileManagerConnection(serverId: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const pending = useRef<Map<string, Pending>>(new Map());
  const counter = useRef(0);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [homeDir, setHomeDir] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(
      `${proto}://${window.location.host}/api/ws/files?serverId=${encodeURIComponent(serverId)}`
    );
    wsRef.current = ws;

    ws.onopen = () => setStatus("open");
    ws.onclose = () => setStatus("closed");
    ws.onerror = () => setStatus("error");
    ws.onmessage = (ev) => {
      let msg: FileManagerServerMessage;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === "ready") {
        setHomeDir(msg.homeDir);
        return;
      }
      if (msg.type === "error" && !msg.reqId) {
        setBanner(msg.message);
        return;
      }
      const reqId = "reqId" in msg ? msg.reqId : undefined;
      if (reqId && pending.current.has(reqId)) {
        const entry = pending.current.get(reqId)!;
        pending.current.delete(reqId);
        if (msg.type === "error") {
          entry.reject(new FileOpError(msg.message, msg.code));
        } else {
          entry.resolve(msg);
        }
      }
    };

    const pendingMap = pending.current;
    return () => {
      ws.close();
      wsRef.current = null;
      for (const p of pendingMap.values()) {
        p.reject(new Error("Verbindung geschlossen"));
      }
      pendingMap.clear();
    };
  }, [serverId]);

  const call = useCallback(
    (msg: DistributiveOmit<FileManagerClientMessage, "reqId">): Promise<FileManagerServerMessage> => {
      return new Promise((resolve, reject) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          reject(new Error("Keine Verbindung zum Server"));
          return;
        }
        const reqId = `r${++counter.current}`;
        pending.current.set(reqId, { resolve, reject });
        ws.send(JSON.stringify({ ...msg, reqId }));
      });
    },
    []
  );

  const list = useCallback(
    async (path: string): Promise<FileNodeDTO[]> => {
      const res = await call({ type: "list", path });
      if (res.type !== "list-result") throw new Error("Unerwartete Antwort");
      return res.entries;
    },
    [call]
  );

  const mkdir = useCallback((path: string) => call({ type: "mkdir", path }), [call]);
  const touch = useCallback((path: string) => call({ type: "touch", path }), [call]);
  const remove = useCallback((path: string) => call({ type: "delete", path }), [call]);
  const rename = useCallback(
    (from: string, to: string) => call({ type: "rename", from, to }),
    [call]
  );
  const copy = useCallback(
    (from: string, to: string) => call({ type: "copy", from, to }),
    [call]
  );
  const move = useCallback(
    (from: string, to: string) => call({ type: "move", from, to }),
    [call]
  );
  const chmod = useCallback(
    (path: string, mode: string) => call({ type: "chmod", path, mode }),
    [call]
  );
  const chown = useCallback(
    (path: string, uid: number, gid: number) => call({ type: "chown", path, uid, gid }),
    [call]
  );
  const readFile = useCallback(
    async (path: string): Promise<string> => {
      const res = await call({ type: "readFile", path });
      if (res.type !== "read-result") throw new Error("Unerwartete Antwort");
      return res.content;
    },
    [call]
  );
  const writeFile = useCallback(
    (path: string, content: string) => call({ type: "writeFile", path, content }),
    [call]
  );

  return {
    status,
    homeDir,
    banner,
    clearBanner: () => setBanner(null),
    list,
    mkdir,
    touch,
    remove,
    rename,
    copy,
    move,
    chmod,
    chown,
    readFile,
    writeFile,
  };
}

export type FileManagerConnection = ReturnType<typeof useFileManagerConnection>;
