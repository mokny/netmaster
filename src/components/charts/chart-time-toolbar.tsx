"use client";

import { ZoomIn, ZoomOut, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatWindowLabel, type ChartTimeWindow } from "@/hooks/use-chart-time-window";

// Geteilte Zoom/Pan/Live-Toolbar für Zeitreihen-Charts - siehe
// useChartTimeWindow. `compact` verkleinert die Buttons für Dashboard-Widgets.
export function ChartTimeToolbar({
  window,
  compact = false,
  className,
}: {
  window: ChartTimeWindow;
  compact?: boolean;
  className?: string;
}) {
  const btnSize = compact ? "size-5" : "size-7";
  const iconSize = compact ? "size-3" : "size-3.5";

  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={btnSize}
        disabled={!window.canZoomOut}
        onClick={window.zoomOut}
        title="Zoom out"
      >
        <ZoomOut className={iconSize} />
      </Button>
      {!compact && (
        <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">
          {formatWindowLabel(window.windowMs)}
        </span>
      )}
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={btnSize}
        disabled={!window.canZoomIn}
        onClick={window.zoomIn}
        title="Zoom in"
      >
        <ZoomIn className={iconSize} />
      </Button>
      <Button
        type="button"
        variant={window.isLive ? "secondary" : "default"}
        size={compact ? "icon" : "sm"}
        className={compact ? btnSize : "h-7 px-2"}
        disabled={window.isLive}
        onClick={window.goLive}
        title="Live"
      >
        <Radio className={cn(iconSize, !window.isLive && "animate-pulse")} />
        {!compact && "Live"}
      </Button>
    </div>
  );
}
