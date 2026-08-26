"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronRight,
  FolderPlus,
  Upload,
  LogOut,
  Loader2,
  List as ListIcon,
  LayoutGrid,
  Download,
  Trash2,
  FolderInput,
  Copy,
  X,
  Trash,
  ArrowUpDown,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { usePrompt } from "@/components/ui/prompt-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  fbList,
  fbLogout,
  fbMe,
  fbMkdir,
  fbRename,
  fbMove,
  fbCopy,
  fbDelete,
  fbUpload,
  fbDownloadUrl,
  fbZipUrl,
} from "./api-client";
import { ConflictMode, FbApiError, type FbEntry, type SortDir, type SortKey } from "./types";
import { fbErrorMessage } from "./format";
import { ItemGridTile, ItemListRow, type ItemActions } from "./item-row";
import { useConflictDialog } from "./use-conflict-dialog";
import { MoveCopyDialog } from "./move-copy-dialog";
import { PreviewDialog } from "./preview-dialog";

function joinPath(dir: string, name: string): string {
  return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

interface DroppedFile {
  file: File;
  relPath: string;
}

// Traversiert per Drag&Drop abgelegte Dateien/Ordner über die
// DataTransferItem/FileSystemEntry-API (funktioniert nur in Chromium/WebKit-
// Browsern - Firefox liefert dort nur flache Dateien, was für Desktop wie
// Mobile trotzdem ein sinnvoller Fallback ist).
async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<DroppedFile[]> {
  const results: DroppedFile[] = [];
  const items = Array.from(dataTransfer.items);

  type FsEntry = {
    isFile: boolean;
    isDirectory: boolean;
    name: string;
    file: (cb: (f: File) => void, err: (e: unknown) => void) => void;
    createReader: () => { readEntries: (cb: (e: FsEntry[]) => void, err: (e: unknown) => void) => void };
  };

  async function traverse(entry: FsEntry, prefix: string): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
      results.push({ file, relPath: `${prefix}${file.name}` });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const all: FsEntry[] = [];
      // readEntries liefert nur Batches - solange lesen, bis ein leeres Batch kommt.
      for (;;) {
        const batch = await new Promise<FsEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (batch.length === 0) break;
        all.push(...batch);
      }
      for (const child of all) {
        await traverse(child, `${prefix}${entry.name}/`);
      }
    }
  }

  let usedEntries = false;
  for (const item of items) {
    const entry = (item as unknown as { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.();
    if (entry) {
      usedEntries = true;
      await traverse(entry, "");
    }
  }
  if (!usedEntries) {
    for (const file of Array.from(dataTransfer.files)) {
      results.push({ file, relPath: file.name });
    }
  }
  return results;
}

export function FilebrowserExplorer({ serverId }: { serverId: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const { ask: askConflict, dialog: conflictDialog } = useConflictDialog();

  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState("");
  const [thumbnailsEnabled, setThumbnailsEnabled] = useState(false);

  const [currentPath, setCurrentPath] = useState("/");
  const [entries, setEntries] = useState<FbEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [moveCopyMode, setMoveCopyMode] = useState<"move" | "copy" | null>(null);
  const [moveCopyItems, setMoveCopyItems] = useState<FbEntry[]>([]);
  const [previewEntry, setPreviewEntry] = useState<FbEntry | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bootstrap: Session prüfen, sonst zum Login.
  useEffect(() => {
    let cancelled = false;
    fbMe(serverId)
      .then((data) => {
        if (cancelled) return;
        setUsername(data.username);
        setThumbnailsEnabled(data.thumbnailsEnabled);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) router.replace(`/filebrowser/${serverId}/login`);
      });
    return () => {
      cancelled = true;
    };
  }, [serverId, router]);

  const loadDir = useCallback(
    async (p: string) => {
      setLoading(true);
      try {
        const data = await fbList(serverId, p);
        setEntries(data.entries);
      } catch (err) {
        if (err instanceof FbApiError && err.status === 401) {
          router.replace(`/filebrowser/${serverId}/login`);
          return;
        }
        toast.error(err instanceof FbApiError ? fbErrorMessage(err.code) : "Fehler beim Laden.");
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [serverId, router]
  );

  useEffect(() => {
    if (!ready) return;
    setSelected(new Set());
    loadDir(currentPath);
  }, [ready, currentPath, loadDir]);

  const filteredSorted = useMemo(() => {
    const list = (entries ?? []).filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));
    const dirMul = sortDir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "size") cmp = a.size - b.size;
      else if (sortKey === "mtime") cmp = a.mtime - b.mtime;
      else if (sortKey === "type") cmp = (a.extension ?? "").localeCompare(b.extension ?? "");
      return cmp * dirMul;
    });
  }, [entries, search, sortKey, sortDir]);

  const breadcrumbSegments = currentPath === "/" ? [] : currentPath.split("/").filter(Boolean);

  function navigate(path: string) {
    setCurrentPath(path);
  }

  function toggleSelect(path: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(path);
      else next.delete(path);
      return next;
    });
  }

  const selectedEntries = useMemo(
    () => filteredSorted.filter((e) => selected.has(e.path)),
    [filteredSorted, selected]
  );

  async function withConflict(
    label: string,
    run: (conflict?: ConflictMode) => Promise<void>,
    forcedRef: { current: ConflictMode | undefined }
  ) {
    let mode = forcedRef.current;
    for (;;) {
      try {
        await run(mode);
        return true;
      } catch (err) {
        if (err instanceof FbApiError && err.code === "EXISTS") {
          const result = await askConflict(label);
          if (result.mode === "cancel") return false;
          mode = result.mode;
          if (result.applyToAll) forcedRef.current = result.mode;
          continue;
        }
        throw err;
      }
    }
  }

  const actions: ItemActions = {
    onOpen(entry) {
      if (entry.isDirectory) navigate(entry.path);
      else setPreviewEntry(entry);
    },
    onDownload(entry) {
      window.location.href = fbDownloadUrl(serverId, entry.path);
    },
    async onRename(entry) {
      const newName = await prompt({
        title: "Umbenennen",
        label: "Neuer Name",
        defaultValue: entry.name,
      });
      if (!newName || newName === entry.name) return;
      const forcedRef = { current: undefined as ConflictMode | undefined };
      try {
        const ok = await withConflict(newName, (c) => fbRename(serverId, entry.path, newName, c).then(() => {}), forcedRef);
        if (ok) {
          toast.success("Umbenannt.");
          loadDir(currentPath);
        }
      } catch (err) {
        toast.error(err instanceof FbApiError ? fbErrorMessage(err.code) : "Umbenennen fehlgeschlagen.");
      }
    },
    onMove(entry) {
      setMoveCopyItems([entry]);
      setMoveCopyMode("move");
    },
    onCopy(entry) {
      setMoveCopyItems([entry]);
      setMoveCopyMode("copy");
    },
    async onDelete(entry) {
      if (!(await confirm({ title: "Löschen", description: `„${entry.name}“ in den Papierkorb verschieben?`, variant: "destructive" })))
        return;
      try {
        await fbDelete(serverId, [entry.path]);
        toast.success("In den Papierkorb verschoben.");
        loadDir(currentPath);
      } catch (err) {
        toast.error(err instanceof FbApiError ? fbErrorMessage(err.code) : "Löschen fehlgeschlagen.");
      }
    },
  };

  async function handleNewFolder() {
    const name = await prompt({ title: "Neuer Ordner", label: "Name" });
    if (!name) return;
    try {
      await fbMkdir(serverId, joinPath(currentPath, name));
      toast.success("Ordner erstellt.");
      loadDir(currentPath);
    } catch (err) {
      toast.error(err instanceof FbApiError ? fbErrorMessage(err.code) : "Ordner konnte nicht erstellt werden.");
    }
  }

  async function performUpload(files: DroppedFile[]) {
    if (files.length === 0) return;
    setUploading(true);
    const forcedRef = { current: undefined as ConflictMode | undefined };
    try {
      const ok = await withConflict(
        files.length === 1 ? files[0].file.name : `${files.length} Dateien`,
        (c) => fbUpload(serverId, currentPath, files, c).then(() => {}),
        forcedRef
      );
      if (ok) {
        toast.success(`${files.length} Datei(en) hochgeladen.`);
        loadDir(currentPath);
      }
    } catch (err) {
      toast.error(err instanceof FbApiError ? fbErrorMessage(err.code) : "Upload fehlgeschlagen.");
    } finally {
      setUploading(false);
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).map((file) => ({ file, relPath: file.name }));
    e.target.value = "";
    void performUpload(files);
  }

  // Drag&Drop-Upload direkt auf das Fenster (nicht nur eine Drop-Zone).
  useEffect(() => {
    if (!ready) return;
    let dragDepth = 0;
    function onDragEnter(e: DragEvent) {
      if (!e.dataTransfer?.types.includes("Files")) return;
      dragDepth += 1;
      setDragOver(true);
    }
    function onDragOver(e: DragEvent) {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
    }
    function onDragLeave() {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setDragOver(false);
    }
    async function onDrop(e: DragEvent) {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      dragDepth = 0;
      setDragOver(false);
      const files = await collectDroppedFiles(e.dataTransfer);
      void performUpload(files);
    }
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, currentPath, serverId]);

  async function handleMoveCopyConfirm(targetDir: string) {
    const mode = moveCopyMode;
    const items = moveCopyItems;
    setMoveCopyMode(null);
    if (!mode || items.length === 0) return;
    const forcedRef = { current: undefined as ConflictMode | undefined };
    let successCount = 0;
    for (const item of items) {
      const dest = joinPath(targetDir, item.name);
      if (dest === item.path) continue;
      try {
        const ok = await withConflict(
          item.name,
          (c) => (mode === "move" ? fbMove(serverId, item.path, dest, c) : fbCopy(serverId, item.path, dest, c)).then(() => {}),
          forcedRef
        );
        if (ok) successCount += 1;
      } catch (err) {
        toast.error(err instanceof FbApiError ? `${item.name}: ${fbErrorMessage(err.code)}` : `${item.name}: Fehlgeschlagen.`);
      }
    }
    if (successCount > 0) {
      toast.success(mode === "move" ? "Verschoben." : "Kopiert.");
      loadDir(currentPath);
    }
  }

  async function handleDeleteSelected() {
    if (selectedEntries.length === 0) return;
    if (
      !(await confirm({
        title: "Löschen",
        description: `${selectedEntries.length} Element(e) in den Papierkorb verschieben?`,
        variant: "destructive",
      }))
    )
      return;
    try {
      await fbDelete(serverId, selectedEntries.map((e) => e.path));
      toast.success("In den Papierkorb verschoben.");
      loadDir(currentPath);
    } catch (err) {
      toast.error(err instanceof FbApiError ? fbErrorMessage(err.code) : "Löschen fehlgeschlagen.");
    }
  }

  function handleDownloadSelected() {
    if (selectedEntries.length === 0) return;
    if (selectedEntries.length === 1 && !selectedEntries[0].isDirectory) {
      window.location.href = fbDownloadUrl(serverId, selectedEntries[0].path);
      return;
    }
    window.location.href = fbZipUrl(serverId, selectedEntries.map((e) => e.path));
  }

  async function handleLogout() {
    await fbLogout(serverId);
    router.replace(`/filebrowser/${serverId}/login`);
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
      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-primary/10 backdrop-blur-sm">
          <div className="rounded-xl bg-popover px-6 py-4 text-sm font-medium ring-1 ring-primary">
            Dateien hier ablegen zum Hochladen
          </div>
        </div>
      )}

      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-3 py-2.5 backdrop-blur">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1 text-sm">
            <button className="font-medium hover:underline" onClick={() => navigate("/")}>
              Freigaben
            </button>
            {breadcrumbSegments.map((seg, i) => (
              <span key={i} className="flex items-center gap-1 text-muted-foreground">
                <ChevronRight className="size-3.5" />
                <button
                  className="hover:text-foreground hover:underline"
                  onClick={() => navigate(`/${breadcrumbSegments.slice(0, i + 1).join("/")}`)}
                >
                  {seg}
                </button>
              </span>
            ))}
          </div>
          <p className="truncate text-xs text-muted-foreground">{username}</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => router.push(`/filebrowser/${serverId}/trash`)} title="Papierkorb">
          <Trash className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={handleLogout} title="Abmelden">
          <LogOut className="size-4" />
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
        <Input
          placeholder="Suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 max-w-[10rem] flex-1"
        />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" />}>
            <ArrowUpDown className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(["name", "size", "mtime", "type"] as SortKey[]).map((key) => (
              <DropdownMenuItem key={key} onClick={() => setSortKey(key)}>
                {sortKey === key && <Check className="size-3.5" />}
                {key === "name" ? "Name" : key === "size" ? "Größe" : key === "mtime" ? "Geändert" : "Typ"}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}>
              {sortDir === "asc" ? "Aufsteigend" : "Absteigend"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setView((v) => (v === "list" ? "grid" : "list"))}
          title="Ansicht wechseln"
        >
          {view === "list" ? <LayoutGrid className="size-4" /> : <ListIcon className="size-4" />}
        </Button>
        {currentPath !== "/" && (
          <Button variant="outline" size="icon-sm" onClick={handleNewFolder} title="Neuer Ordner">
            <FolderPlus className="size-4" />
          </Button>
        )}
        {currentPath !== "/" && (
          <Button variant="outline" size="icon-sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Hochladen">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          </Button>
        )}
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileInputChange} />
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2 text-sm">
          <Button variant="ghost" size="icon-sm" onClick={() => setSelected(new Set())}>
            <X className="size-4" />
          </Button>
          <span className="flex-1">{selected.size} ausgewählt</span>
          <Button variant="ghost" size="icon-sm" onClick={handleDownloadSelected} title="Herunterladen">
            <Download className="size-4" />
          </Button>
          {currentPath !== "/" && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setMoveCopyItems(selectedEntries);
                setMoveCopyMode("move");
              }}
              title="Verschieben"
            >
              <FolderInput className="size-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setMoveCopyItems(selectedEntries);
              setMoveCopyMode("copy");
            }}
            title="Kopieren"
          >
            <Copy className="size-4" />
          </Button>
          {currentPath !== "/" && (
            <Button variant="ghost" size="icon-sm" onClick={handleDeleteSelected} title="Löschen">
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      )}

      <div className="flex-1 px-2 py-2">
        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && filteredSorted.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {search ? "Keine Treffer." : "Dieser Ordner ist leer."}
          </p>
        )}
        {!loading && view === "list" && (
          <div className="space-y-0.5">
            {filteredSorted.map((entry) => (
              <ItemListRow
                key={entry.path}
                entry={entry}
                selected={selected.has(entry.path)}
                onToggleSelect={(c) => toggleSelect(entry.path, c)}
                actions={actions}
                showThumbnails={thumbnailsEnabled}
                serverId={serverId}
                isRoot={currentPath === "/"}
              />
            ))}
          </div>
        )}
        {!loading && view === "grid" && (
          <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-5">
            {filteredSorted.map((entry) => (
              <ItemGridTile
                key={entry.path}
                entry={entry}
                selected={selected.has(entry.path)}
                onToggleSelect={(c) => toggleSelect(entry.path, c)}
                actions={actions}
                showThumbnails={thumbnailsEnabled}
                serverId={serverId}
                isRoot={currentPath === "/"}
              />
            ))}
          </div>
        )}
      </div>

      <MoveCopyDialog
        serverId={serverId}
        mode={moveCopyMode}
        onOpenChange={(open) => !open && setMoveCopyMode(null)}
        onConfirm={handleMoveCopyConfirm}
      />
      <PreviewDialog serverId={serverId} entry={previewEntry} onOpenChange={(open) => !open && setPreviewEntry(null)} />
      {conflictDialog}
    </div>
  );
}
