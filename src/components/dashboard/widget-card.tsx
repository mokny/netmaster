"use client";

import { X, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function WidgetCard({
  title,
  subtitle,
  editing,
  onRemove,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  editing: boolean;
  onRemove: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col rounded-lg border bg-card text-card-foreground shadow-xs",
        className
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        {editing && (
          <span className="widget-drag-handle cursor-move text-muted-foreground">
            <GripVertical className="size-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          {subtitle && (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {editing && (
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0"
            onClick={onRemove}
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-2">{children}</div>
    </div>
  );
}
