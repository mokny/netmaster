"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { X, Minus, TerminalSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TerminalSession } from "@/hooks/use-terminal-manager";

const WIDTH = 640;
const HEIGHT = 380;
const BASE_OFFSET = 24;
const OFFSET_STEP = 28;

export function FloatingTerminal({
  session,
  onClose,
  onToggleMinimize,
}: {
  session: TerminalSession;
  onClose: () => void;
  onToggleMinimize: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "closed" | "error">(
    "connecting"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [pos, setPos] = useState(() => ({
    x: null as number | null,
    y: null as number | null,
  }));
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null
  );

  useEffect(() => {
    if (!containerRef.current || session.minimized) return;

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
    termRef.current = term;
    fitRef.current = fit;

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl =
      session.vmid !== null
        ? `${protocol}://${window.location.host}/api/ws/vm-terminal?serverId=${encodeURIComponent(session.serverId)}&vmid=${session.vmid}`
        : `${protocol}://${window.location.host}/api/ws/terminal?serverId=${encodeURIComponent(session.serverId)}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

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
      termRef.current = null;
      fitRef.current = null;
      wsRef.current = null;
    };
  }, [session.serverId, session.vmid, session.minimized]);

  function onDragStart(e: React.MouseEvent) {
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x ?? rect.left,
      origY: pos.y ?? rect.top,
    };
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragEnd);
  }

  function onDragMove(e: MouseEvent) {
    const d = dragState.current;
    if (!d) return;
    setPos({
      x: Math.max(0, d.origX + (e.clientX - d.startX)),
      y: Math.max(0, d.origY + (e.clientY - d.startY)),
    });
  }

  function onDragEnd() {
    dragState.current = null;
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragEnd);
  }

  const offset = BASE_OFFSET + session.offset * OFFSET_STEP;
  const style: React.CSSProperties = session.minimized
    ? { right: offset, bottom: BASE_OFFSET }
    : pos.x != null && pos.y != null
      ? { left: pos.x, top: pos.y }
      : { right: offset, bottom: offset };

  return (
    <div
      className={cn(
        "pointer-events-auto fixed z-50 flex flex-col overflow-hidden rounded-lg border bg-card shadow-xl",
        session.minimized && "h-10 w-64"
      )}
      style={{ ...style, width: session.minimized ? undefined : WIDTH, height: session.minimized ? undefined : HEIGHT }}
    >
      <div
        onMouseDown={onDragStart}
        className="flex h-10 shrink-0 cursor-move items-center justify-between gap-2 border-b bg-muted/50 px-3 select-none"
      >
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <TerminalSquare className="size-4 shrink-0" />
          <span className="truncate">{session.serverName}</span>
          {status === "connecting" && (
            <span className="text-xs font-normal text-muted-foreground">verbinde…</span>
          )}
          {status === "error" && (
            <span className="text-xs font-normal text-red-500">Fehler</span>
          )}
          {status === "closed" && (
            <span className="text-xs font-normal text-muted-foreground">getrennt</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleMinimize}
            className="rounded p-1 hover:bg-accent"
            aria-label={session.minimized ? "Wiederherstellen" : "Minimieren"}
          >
            <Minus className="size-3.5" />
          </button>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent" aria-label="Schließen">
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      {!session.minimized && (
        <div className="relative flex-1 overflow-hidden bg-black p-1">
          {session.vmType === "QEMU" && status !== "error" && (
            <div className="absolute inset-x-0 top-0 z-10 bg-amber-950/90 px-3 py-1 text-xs text-amber-200">
              Erfordert eine im Gast-OS eingerichtete serielle Konsole (z.B. ttyS0) – schlägt sonst
              fehl.
            </div>
          )}
          <div ref={containerRef} className="h-full w-full" />
          {status === "error" && errorMessage && (
            <div className="absolute inset-x-0 bottom-0 bg-red-950/90 px-3 py-1.5 text-xs text-red-200">
              {errorMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
