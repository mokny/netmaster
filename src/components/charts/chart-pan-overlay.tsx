"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

// Dünner Drag-Layer über einem Recharts-Container, der horizontales Ziehen in
// eine Zeitverschiebung übersetzt (siehe useChartTimeWindow.panBy). Recharts
// hat keine eingebaute Pan-Geste - Pointer Events statt separater
// Maus-/Touch-Handler, damit Maus und Touch identisch funktionieren.
export function ChartPanOverlay({
  windowMs,
  onPanBy,
  children,
  className,
}: {
  windowMs: number;
  onPanBy: (deltaMs: number) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; lastX: number } | null>(null);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== undefined && e.button !== 0) return;
    dragRef.current = { pointerId: e.pointerId, lastX: e.clientX };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !containerRef.current) return;
    const width = containerRef.current.clientWidth;
    if (width <= 0) return;
    const deltaX = e.clientX - drag.lastX;
    if (deltaX === 0) return;
    dragRef.current = { ...drag, lastX: e.clientX };
    onPanBy(-(deltaX / width) * windowMs);
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Pointer war evtl. bereits freigegeben (z.B. nach pointercancel).
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn("touch-none select-none", className)}
      style={{ cursor: "grab" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {children}
    </div>
  );
}
