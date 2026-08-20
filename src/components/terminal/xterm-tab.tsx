"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { TerminalSession } from "@/hooks/use-terminal-manager";

function buildWsUrl(session: TerminalSession): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.host;
  if (session.kind === "vm-serial") {
    return `${protocol}://${host}/api/ws/vm-terminal?serverId=${encodeURIComponent(session.serverId)}&vmid=${session.vmid}`;
  }
  if (session.kind === "docker-exec") {
    return `${protocol}://${host}/api/ws/docker-terminal?serverId=${encodeURIComponent(session.serverId)}&containerId=${encodeURIComponent(session.containerId ?? "")}`;
  }
  return `${protocol}://${host}/api/ws/terminal?serverId=${encodeURIComponent(session.serverId)}`;
}

export function XtermTab({ session, active }: { session: TerminalSession; active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "closed" | "error">(
    "connecting"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      convertEol: true,
      fontSize: 13,
      fontFamily: "var(--font-mono, ui-monospace, monospace)",
      theme: { background: "#00000000" },
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    const ws = new WebSocket(buildWsUrl(session));
    ws.binaryType = "arraybuffer";

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "connected") setStatus("connected");
          if (msg.type === "error") {
            setStatus("error");
            setErrorMessage(msg.message ?? "Verbindung fehlgeschlagen");
          }
          if (msg.type === "closed") setStatus("closed");
        } catch {
          // ignore
        }
        return;
      }
      term.write(new Uint8Array(event.data as ArrayBuffer));
    };
    ws.onerror = () => setStatus("error");
    ws.onclose = () => setStatus((s) => (s === "error" ? s : "closed"));

    const encoder = new TextEncoder();
    const onData = term.onData((data) => {
      // Als Binärframe senden – Textframes interpretiert der Server als
      // JSON-Steuernachrichten (siehe terminal-handler.ts).
      if (ws.readyState === WebSocket.OPEN) ws.send(encoder.encode(data));
    });

    const sendResize = () => {
      fit.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    };
    const resizeObserver = new ResizeObserver(sendResize);
    resizeObserver.observe(containerRef.current);
    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    return () => {
      onData.dispose();
      resizeObserver.disconnect();
      ws.close();
      term.dispose();
    };
    // Session-Identität ist über die deduplizierte Tab-ID stabil – die
    // Verbindung soll die gesamte Lebensdauer des Tabs bestehen bleiben,
    // unabhängig davon ob er gerade sichtbar ist.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  // Größe neu anpassen, sobald der Tab (wieder) sichtbar wird.
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 0);
    return () => clearTimeout(timer);
  }, [active]);

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-black p-1">
      {session.kind === "vm-serial" && session.vmType === "QEMU" && status !== "error" && (
        <div className="absolute inset-x-0 top-0 z-10 bg-amber-950/90 px-3 py-1 text-xs text-amber-200">
          Erfordert eine im Gast-OS eingerichtete serielle Konsole (z.B. ttyS0) – schlägt sonst
          fehl. Alternativ die VNC-Konsole verwenden.
        </div>
      )}
      {status === "connecting" && (
        <div className="absolute inset-x-0 bottom-0 z-10 bg-muted/90 px-3 py-1 text-xs text-muted-foreground">
          verbinde…
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
      {status === "error" && errorMessage && (
        <div className="absolute inset-x-0 bottom-0 bg-red-950/90 px-3 py-1.5 text-xs text-red-200">
          {errorMessage}
        </div>
      )}
      {status === "closed" && (
        <div className="absolute inset-x-0 bottom-0 bg-muted/90 px-3 py-1 text-xs text-muted-foreground">
          getrennt
        </div>
      )}
    </div>
  );
}
