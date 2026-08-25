"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Folder, FolderUp, Loader2 } from "lucide-react";

interface DirEntry {
  name: string;
  path: string;
}

export function NasFolderBrowserDialog({
  open,
  onOpenChange,
  serverId,
  initialPath,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
  initialPath: string;
  onSelect: (path: string) => void;
}) {
  const t = useTranslations("admin.nasShareForm");
  const tErrors = useTranslations("errors");
  const [path, setPath] = useState(initialPath || "/");
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPath(initialPath && initialPath.startsWith("/") ? initialPath : "/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/servers/${serverId}/storage/browse?path=${encodeURIComponent(path)}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          toast.error(tErrors(data.error ?? "INTERNAL_ERROR"));
          setEntries([]);
          setParentPath(null);
          setNotFound(false);
          return;
        }
        setEntries(data.entries ?? []);
        setParentPath(data.parentPath ?? null);
        setNotFound(Boolean(data.notFound));
      })
      .catch(() => {
        if (!cancelled) toast.error(tErrors("INTERNAL_ERROR"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, path, serverId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("browserTitle")}</DialogTitle>
        </DialogHeader>
        <p className="truncate rounded border bg-muted/40 px-2 py-1.5 font-mono text-xs">{path}</p>
        <div className="h-64 overflow-y-auto rounded border">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : notFound ? (
            <p className="p-3 text-sm text-muted-foreground">{t("browserNotFound")}</p>
          ) : (
            <div className="divide-y">
              {parentPath !== null && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
                  onClick={() => setPath(parentPath)}
                >
                  <FolderUp className="size-4 text-muted-foreground" />
                  ..
                </button>
              )}
              {entries.length === 0 && parentPath === null && (
                <p className="p-3 text-sm text-muted-foreground">{t("browserEmpty")}</p>
              )}
              {entries.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
                  onClick={() => setPath(entry.path)}
                >
                  <Folder className="size-4 text-muted-foreground" />
                  {entry.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("browserCancel")}
          </Button>
          <Button type="button" disabled={notFound} onClick={() => onSelect(path)}>
            {t("browserSelectHere")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
