"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Folder, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fbList } from "./api-client";
import type { FbEntry } from "./types";

// Einfacher Ordner-Picker für Verschieben/Kopieren: navigiert nur innerhalb
// der eigenen erlaubten Freigaben (die Liste kommt ohnehin nur aus fbList,
// das server-seitig bereits auf erlaubte Freigaben eingeschränkt ist).
export function MoveCopyDialog({
  serverId,
  mode,
  onOpenChange,
  onConfirm,
}: {
  serverId: string;
  mode: "move" | "copy" | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (targetDir: string) => void;
}) {
  const open = mode !== null;
  const [path, setPath] = useState("/");
  const [dirs, setDirs] = useState<FbEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setPath("/");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fbList(serverId, path)
      .then((d) => {
        if (!cancelled) setDirs(d.entries.filter((e) => e.isDirectory));
      })
      .catch(() => {
        if (!cancelled) setDirs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, path, serverId]);

  const segments = path === "/" ? [] : path.split("/").filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "copy" ? "Kopieren nach…" : "Verschieben nach…"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <button type="button" className="hover:underline" onClick={() => setPath("/")}>
            Freigaben
          </button>
          {segments.map((seg, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="size-3" />
              <button
                type="button"
                className="hover:underline"
                onClick={() => setPath(`/${segments.slice(0, i + 1).join("/")}`)}
              >
                {seg}
              </button>
            </span>
          ))}
        </div>
        <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-md border p-1">
          {loading && (
            <div className="flex justify-center p-4">
              <Loader2 className="size-4 animate-spin" />
            </div>
          )}
          {!loading && dirs?.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">Keine Unterordner</p>
          )}
          {!loading &&
            dirs?.map((d) => (
              <button
                key={d.path}
                type="button"
                onClick={() => setPath(d.path)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <Folder className="size-4 text-muted-foreground" />
                {d.name}
              </button>
            ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={() => onConfirm(path)}>
            {mode === "copy" ? "Hierher kopieren" : "Hierher verschieben"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
