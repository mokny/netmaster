"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, RotateCcw, Trash2, File, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useConflictDialog } from "./use-conflict-dialog";
import { fbTrashList, fbTrashRestore, fbTrashEmpty, fbMe } from "./api-client";
import { FbApiError, type ConflictMode, type TrashItem } from "./types";
import { fbErrorMessage, formatBytes, formatDate } from "./format";

export function FilebrowserTrashView({ serverId }: { serverId: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { ask: askConflict, dialog: conflictDialog } = useConflictDialog();

  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    fbMe(serverId)
      .then(() => setReady(true))
      .catch(() => router.replace(`/filebrowser/${serverId}/login`));
  }, [serverId, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fbTrashList(serverId);
      setItems(data.items);
    } catch (err) {
      toast.error(err instanceof FbApiError ? fbErrorMessage(err.code) : "Fehler beim Laden.");
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  function itemKey(item: TrashItem): string {
    return `${item.share}::${item.entryName}`;
  }

  async function restore(item: TrashItem) {
    const key = itemKey(item);
    setBusyKey(key);
    let mode: ConflictMode | undefined;
    try {
      for (;;) {
        try {
          await fbTrashRestore(serverId, item.share, item.entryName, mode);
          toast.success("Wiederhergestellt.");
          load();
          return;
        } catch (err) {
          if (err instanceof FbApiError && err.code === "EXISTS") {
            const result = await askConflict(item.originalRelPath.split("/").pop() ?? item.originalRelPath);
            if (result.mode === "cancel") return;
            mode = result.mode;
            continue;
          }
          throw err;
        }
      }
    } catch (err) {
      toast.error(err instanceof FbApiError ? fbErrorMessage(err.code) : "Wiederherstellen fehlgeschlagen.");
    } finally {
      setBusyKey(null);
    }
  }

  async function emptyAll() {
    if (!(await confirm({ title: "Papierkorb leeren", description: "Alle Elemente werden endgültig gelöscht.", variant: "destructive" })))
      return;
    try {
      const { removed } = await fbTrashEmpty(serverId);
      toast.success(`${removed} Element(e) endgültig gelöscht.`);
      load();
    } catch (err) {
      toast.error(err instanceof FbApiError ? fbErrorMessage(err.code) : "Leeren fehlgeschlagen.");
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-3 py-2.5 backdrop-blur">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push(`/filebrowser/${serverId}`)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="flex-1 text-sm font-medium">Papierkorb</h1>
        {items && items.length > 0 && (
          <Button variant="destructive" size="sm" onClick={emptyAll}>
            <Trash2 className="size-4" /> Leeren
          </Button>
        )}
      </header>

      <div className="flex-1 px-2 py-2">
        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && items?.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">Der Papierkorb ist leer.</p>
        )}
        {!loading && (
          <div className="space-y-0.5">
            {items?.map((item) => (
              <div key={itemKey(item)} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted">
                {item.isDirectory ? (
                  <Folder className="size-5 shrink-0 text-primary" />
                ) : (
                  <File className="size-5 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{item.originalRelPath}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.share} · {item.isDirectory ? "Ordner" : formatBytes(item.size)} · gelöscht {formatDate(item.deletedAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={busyKey === itemKey(item)}
                  onClick={() => restore(item)}
                  title="Wiederherstellen"
                >
                  {busyKey === itemKey(item) ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
      {conflictDialog}
    </div>
  );
}
