"use client";

import { useRef } from "react";
import { X, Minus, Maximize2, Minimize2, TerminalSquare, MonitorSmartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTerminalManager, type TerminalSession } from "@/hooks/use-terminal-manager";
import { XtermTab } from "@/components/terminal/xterm-tab";
import { VncTab } from "@/components/terminal/vnc-tab";

const BASE_OFFSET = 24;

function TabIcon({ kind }: { kind: TerminalSession["kind"] }) {
  if (kind === "vm-vnc") return <MonitorSmartphone className="size-3.5 shrink-0" />;
  return <TerminalSquare className="size-3.5 shrink-0" />;
}

export function TerminalPanel() {
  const {
    sessions,
    activeId,
    minimized,
    maximized,
    geometry,
    setActive,
    closeTab,
    toggleMinimize,
    toggleMaximize,
    setGeometry,
  } = useTerminalManager();

  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null
  );
  const resizeState = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(
    null
  );

  if (sessions.length === 0) return null;

  function onDragStart(e: React.MouseEvent) {
    if (maximized) return;
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: geometry.x ?? rect.left,
      origY: geometry.y ?? rect.top,
    };
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragEnd);
  }

  function onDragMove(e: MouseEvent) {
    const d = dragState.current;
    if (!d) return;
    setGeometry({
      x: Math.max(0, d.origX + (e.clientX - d.startX)),
      y: Math.max(0, d.origY + (e.clientY - d.startY)),
    });
  }

  function onDragEnd() {
    dragState.current = null;
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragEnd);
  }

  function onResizeStart(e: React.MouseEvent) {
    if (maximized) return;
    e.stopPropagation();
    resizeState.current = {
      startX: e.clientX,
      startY: e.clientY,
      origW: geometry.width,
      origH: geometry.height,
    };
    window.addEventListener("mousemove", onResizeMove);
    window.addEventListener("mouseup", onResizeEnd);
  }

  function onResizeMove(e: MouseEvent) {
    const r = resizeState.current;
    if (!r) return;
    setGeometry({
      width: r.origW + (e.clientX - r.startX),
      height: r.origH + (e.clientY - r.startY),
    });
  }

  function onResizeEnd() {
    resizeState.current = null;
    window.removeEventListener("mousemove", onResizeMove);
    window.removeEventListener("mouseup", onResizeEnd);
  }

  const style: React.CSSProperties = minimized
    ? { right: BASE_OFFSET, bottom: BASE_OFFSET, width: 280, height: 40 }
    : maximized
      ? { left: 16, top: 16, right: 16, bottom: 16, width: "auto", height: "auto" }
      : {
          left: geometry.x ?? undefined,
          top: geometry.y ?? undefined,
          right: geometry.x == null ? BASE_OFFSET : undefined,
          bottom: geometry.y == null ? BASE_OFFSET : undefined,
          width: geometry.width,
          height: geometry.height,
        };

  return (
    <div
      className="pointer-events-none fixed inset-0 z-40"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="pointer-events-auto fixed flex flex-col overflow-hidden rounded-lg border bg-card shadow-xl"
        style={style}
      >
        <div
          onMouseDown={onDragStart}
          className={cn(
            "flex h-9 shrink-0 items-center gap-1 border-b bg-muted/50 pr-1 select-none",
            !maximized && "cursor-move"
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1">
            {sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => setActive(s.id)}
                role="button"
                tabIndex={0}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
                  s.id === activeId
                    ? "bg-background text-foreground"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                <TabIcon kind={s.kind} />
                <span className="max-w-32 truncate">{s.label}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(s.id);
                  }}
                  className="rounded p-0.5 hover:bg-accent"
                  aria-label="Tab schließen"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              onClick={toggleMinimize}
              className="rounded p-1 hover:bg-accent"
              aria-label={minimized ? "Wiederherstellen" : "Minimieren"}
            >
              <Minus className="size-3.5" />
            </button>
            <button
              onClick={toggleMaximize}
              className="rounded p-1 hover:bg-accent"
              aria-label={maximized ? "Verkleinern" : "Maximieren"}
            >
              {maximized ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </button>
          </div>
        </div>

        {!minimized && (
          <div className="relative min-h-0 min-w-0 flex-1">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="absolute inset-0"
                style={{ display: s.id === activeId ? "block" : "none" }}
              >
                {s.kind === "vm-vnc" ? (
                  <VncTab session={s} />
                ) : (
                  <XtermTab session={s} active={s.id === activeId} />
                )}
              </div>
            ))}
          </div>
        )}

        {!minimized && !maximized && (
          <div
            onMouseDown={onResizeStart}
            className="absolute right-0 bottom-0 size-3 cursor-nwse-resize"
          />
        )}
      </div>
    </div>
  );
}
