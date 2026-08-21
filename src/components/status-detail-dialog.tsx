"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusValue } from "@/components/status-badge";
import { RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatusDetailMetric {
  label: string;
  status: StatusValue;
}

export function StatusDetailDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  status,
  error,
  checkedAt,
  metrics,
  onRecheck,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  status: StatusValue;
  error?: string | null;
  checkedAt?: string | null;
  metrics?: StatusDetailMetric[];
  onRecheck: () => Promise<void>;
}) {
  const [rechecking, setRechecking] = useState(false);

  async function handleRecheck() {
    setRechecking(true);
    try {
      await onRecheck();
    } catch {
      toast.error("Prüfung fehlgeschlagen");
    } finally {
      setRechecking(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {title}
            <StatusBadge status={status} />
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-red-500">
              {error}
            </div>
          )}
          {metrics && metrics.length > 0 && (
            <div className="space-y-1.5">
              {metrics.map((m) => (
                <div
                  key={m.label}
                  className="flex items-center justify-between rounded-md border px-3 py-1.5"
                >
                  <span className="text-muted-foreground">{m.label}</span>
                  <StatusBadge status={m.status} />
                </div>
              ))}
            </div>
          )}
          {checkedAt && (
            <p className="text-xs text-muted-foreground">
              Zuletzt geprüft: {new Date(checkedAt).toLocaleString("de-DE")}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleRecheck} disabled={rechecking}>
            <RotateCw className={cn("size-4", rechecking && "animate-spin")} />
            Jetzt prüfen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
