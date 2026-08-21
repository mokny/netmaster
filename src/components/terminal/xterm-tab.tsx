"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useTerminalManager, type TerminalSession } from "@/hooks/use-terminal-manager";
import { useTranslations } from "next-intl";

function buildWsUrl(session: TerminalSession): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.host;
  if (session.kind === "vm-serial") {
    return `${protocol}://${host}/api/ws/vm-terminal?serverId=${encodeURIComponent(session.serverId)}&vmid=${session.vmid}`;
  }
  if (session.kind === "docker-exec") {
    return `${protocol}://${host}/api/ws/docker-terminal?serverId=${encodeURIComponent(session.serverId)}&containerId=${encodeURIComponent(session.containerId ?? "")}`;
  }
  if (session.kind === "adhoc") {
    return `${protocol}://${host}/api/ws/adhoc-terminal?ticket=${encodeURIComponent(session.ticket ?? "")}`;
  }
  return `${protocol}://${host}/api/ws/terminal?serverId=${encodeURIComponent(session.serverId)}`;
}

export function XtermTab({ session, active }: { session: TerminalSession; active: boolean }) {
  const t = useTranslations("terminal.xtermTab");
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "closed" | "error">(
    "connecting"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { clearPendingCommands } = useTerminalManager();

  // Vom Snippet-Runner per Polling gelesen (siehe waitForOpen unten) - ein
  // Ref statt React-State, damit der Effekt nicht bei jeder Statusänderung
  // neu laufen muss.
  const statusRef = useRef(status);
  const wsRef = useRef<WebSocket | null>(null);
  const outputListeners = useRef<Set<(text: string) => void>>(new Set());
  const runningSnippet = useRef(false);

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
    wsRef.current = ws;
    const decoder = new TextDecoder();

    const applyStatus = (next: "connecting" | "connected" | "closed" | "error") => {
      statusRef.current = next;
      setStatus(next);
    };

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "connected") applyStatus("connected");
          if (msg.type === "error") {
            applyStatus("error");
            setErrorMessage(msg.message ?? t("connectionFailed"));
          }
          if (msg.type === "closed") applyStatus("closed");
        } catch {
          // ignore
        }
        return;
      }
      const bytes = new Uint8Array(event.data as ArrayBuffer);
      term.write(bytes);
      if (outputListeners.current.size > 0) {
        const text = decoder.decode(bytes, { stream: true });
        outputListeners.current.forEach((fn) => fn(text));
      }
    };
    ws.onerror = () => applyStatus("error");
    ws.onclose = () => {
      if (statusRef.current !== "error") applyStatus("closed");
    };

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
      wsRef.current = null;
      term.dispose();
    };
    // Session-Identität ist über die deduplizierte Tab-ID stabil – die
    // Verbindung soll die gesamte Lebensdauer des Tabs bestehen bleiben,
    // unabhängig davon ob er gerade sichtbar ist.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  // Führt die von einem Snippet hinterlegten Befehlszeilen nacheinander aus:
  // jede Zeile bekommt einen unsichtbaren Abschluss-Marker angehängt, auf den
  // im Output gewartet wird, bevor die nächste Zeile gesendet wird.
  useEffect(() => {
    if (!session.pendingCommands || session.pendingCommands.length === 0) return;
    if (runningSnippet.current) return;
    runningSnippet.current = true;
    const commands = session.pendingCommands;
    const encoder = new TextEncoder();
    let cancelled = false;

    // Wartet auf die "connected"-Bestätigung des Servers, nicht nur auf den
    // rohen WebSocket-readyState: Die Verbindung ist schon "OPEN", bevor die
    // Shell/PTY auf dem Server tatsächlich bereitsteht. Ein Kommando, das vor
    // dieser Bestätigung gesendet wird, geht verloren.
    const waitForOpen = () =>
      new Promise<void>((resolve) => {
        const check = () => {
          if (cancelled) return resolve();
          if (statusRef.current === "connected") return resolve();
          setTimeout(check, 100);
        };
        check();
      });

    (async () => {
      for (const cmd of commands) {
        if (cancelled) break;
        await waitForOpen();
        if (cancelled || !wsRef.current) break;

        const marker = `__SNIPPET_DONE_${Math.random().toString(36).slice(2)}__`;
        // Der Marker taucht zweimal im Output auf: einmal als PTY-Echo der
        // gesendeten Zeile selbst (praktisch sofort), einmal als tatsächliche
        // Ausgabe von "echo <marker>" nach Befehlsende. Erst das zweite
        // Auftauchen zählt als "fertig" - sonst würde bei einem Befehl, der
        // auf eine Nutzereingabe wartet (z.B. ein Bestätigungs-Prompt), schon
        // beim Echo weitergesprungen und die nächste Zeile blind in den noch
        // offenen Prompt getippt.
        const done = new Promise<void>((resolve) => {
          let buffer = "";
          let occurrences = 0;
          let searchFrom = 0;
          const listener = (chunk: string) => {
            buffer += chunk;
            let idx: number;
            while ((idx = buffer.indexOf(marker, searchFrom)) !== -1) {
              occurrences++;
              searchFrom = idx + marker.length;
            }
            if (occurrences >= 2) {
              outputListeners.current.delete(listener);
              resolve();
            }
          };
          outputListeners.current.add(listener);
        });

        wsRef.current.send(encoder.encode(`${cmd}; echo ${marker}\r`));
        await done;
      }
      runningSnippet.current = false;
      if (!cancelled) clearPendingCommands(session.id);
    })();

    return () => {
      cancelled = true;
    };
  }, [session.id, session.pendingCommands, session.pendingRunId, clearPendingCommands]);

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
          {t("serialConsoleHint")}
        </div>
      )}
      {status === "connecting" && (
        <div className="absolute inset-x-0 bottom-0 z-10 bg-muted/90 px-3 py-1 text-xs text-muted-foreground">
          {t("connecting")}
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
          {t("disconnected")}
        </div>
      )}
    </div>
  );
}
