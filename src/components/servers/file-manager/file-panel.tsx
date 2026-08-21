"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Folder,
  File as FileIcon,
  FolderPlus,
  FilePlus,
  Trash2,
  Pencil,
  ShieldEllipsis,
  Upload,
  RefreshCw,
  Download,
  ArrowUp,
  Loader2,
  MoreVertical,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { FileNodeDTO } from "@/lib/file-manager-types";
import { useFileManagerConnection } from "@/hooks/use-file-manager-connection";
import { formatDate, formatSize, joinPath, modeToRwx, parentPath } from "./utils";
import { PromptDialog, ChmodDialog, ConflictDialog, ConfirmDialog, type ConflictChoice } from "./dialogs";

const INTERNAL_DND_MIME = "application/x-netmaster-file-paths";

interface DraggedEntry {
  path: string;
  name: string;
  isDirectory: boolean;
}

export interface FilePanelHandle {
  connection: ReturnType<typeof useFileManagerConnection>;
  currentPath: string;
}

export function FilePanel({
  wsPath,
  restBasePath,
  side,
  onOpenFile,
}: {
  wsPath: string;
  restBasePath: string;
  side: "left" | "right";
  onOpenFile: (
    connection: ReturnType<typeof useFileManagerConnection>,
    node: FileNodeDTO
  ) => void;
}) {
  const t = useTranslations("servers.fileManager.panel");
  const tErrors = useTranslations("errors");
  const connection = useFileManagerConnection(wsPath);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState("");
  const [entries, setEntries] = useState<FileNodeDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLAnchorElement>(null);

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [chmodOpen, setChmodOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [conflict, setConflict] = useState<{
    name: string;
    resolve: (choice: ConflictChoice) => void;
  } | null>(null);

  const load = useCallback(
    async (dir: string) => {
      setLoading(true);
      try {
        const list = await connection.list(dir);
        setEntries(list);
        setCurrentPath(dir);
        setPathInput(dir);
        setSelected(new Set());
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("loadDirFailed"));
      } finally {
        setLoading(false);
      }
    },
    [connection]
  );

  useEffect(() => {
    if (!connection.homeDir || currentPath !== null) return;
    // Verzögert per Microtask, damit `load()` (das synchron den
    // Loading-State setzt) nicht direkt im Effekt-Body aufgerufen wird.
    const dir = connection.homeDir;
    const timer = setTimeout(() => void load(dir), 0);
    return () => clearTimeout(timer);
  }, [connection.homeDir, currentPath, load]);

  useEffect(() => {
    if (connection.banner) {
      toast.error(connection.banner);
      connection.clearBanner();
    }
  }, [connection.banner, connection]);

  const refresh = useCallback(() => {
    if (currentPath) void load(currentPath);
  }, [currentPath, load]);

  const askConflict = useCallback((name: string) => {
    return new Promise<ConflictChoice>((resolve) => {
      setConflict({ name, resolve });
    });
  }, []);

  const visibleEntries = entries.filter((e) => showHidden || !e.name.startsWith("."));
  const selectedNodes = entries.filter((e) => selected.has(e.path));

  function toggleSelect(node: FileNodeDTO, e: React.MouseEvent) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        if (next.has(node.path)) next.delete(node.path);
        else next.add(node.path);
      } else {
        next.clear();
        next.add(node.path);
      }
      return next;
    });
  }

  async function handleCreateFolder(name: string) {
    if (!currentPath) return;
    try {
      await connection.mkdir(joinPath(currentPath, name));
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("createFolderFailed"));
    }
  }

  async function handleCreateFile(name: string) {
    if (!currentPath) return;
    try {
      await connection.touch(joinPath(currentPath, name));
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("createFileFailed"));
    }
  }

  async function handleRename(name: string) {
    if (!currentPath || selectedNodes.length !== 1) return;
    const node = selectedNodes[0];
    try {
      await connection.rename(node.path, joinPath(currentPath, name));
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("renameFailed"));
    }
  }

  async function handleDelete() {
    for (const node of selectedNodes) {
      try {
        await connection.remove(node.path);
      } catch (err) {
        toast.error(`${node.name}: ${err instanceof Error ? err.message : t("deleteFailed")}`);
      }
    }
    refresh();
  }

  async function handleChmod(mode: string) {
    if (selectedNodes.length !== 1) return;
    try {
      await connection.chmod(selectedNodes[0].path, mode);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("chmodFailed"));
    }
  }

  async function handleChown(uid: number, gid: number) {
    if (selectedNodes.length !== 1) return;
    try {
      await connection.chown(selectedNodes[0].path, uid, gid);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("chownFailed"));
    }
  }

  function triggerDownload(path: string, isDirectory: boolean) {
    if (!anchorRef.current) return;
    const url = isDirectory
      ? `${restBasePath}/zip?path=${encodeURIComponent(path)}`
      : `${restBasePath}/download?path=${encodeURIComponent(path)}`;
    anchorRef.current.href = url;
    anchorRef.current.click();
  }

  // Verschiebt/kopiert Pfade innerhalb desselben Servers (beide Panels zeigen
  // immer denselben Server, daher genügt eine SFTP-Verbindung für die Operation).
  async function handleInternalDrop(paths: DraggedEntry[], targetDir: string, copyMode: boolean) {
    for (const entry of paths) {
      const dest = joinPath(targetDir, entry.name);
      if (dest === entry.path) continue;
      try {
        if (copyMode) {
          await connection.copy(entry.path, dest);
        } else {
          await connection.move(entry.path, dest);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes("existiert")) {
          const choice = await askConflict(entry.name);
          if (choice === "cancel") continue;
          if (choice === "overwrite") {
            await connection.remove(dest).catch(() => {});
            if (copyMode) await connection.copy(entry.path, dest).catch(() => {});
            else await connection.move(entry.path, dest).catch(() => {});
          } else {
            const renamed = joinPath(targetDir, t("copySuffix", { name: entry.name }));
            if (copyMode) await connection.copy(entry.path, renamed).catch(() => {});
            else await connection.move(entry.path, renamed).catch(() => {});
          }
        } else {
          toast.error(`${entry.name}: ${err instanceof Error ? err.message : t("error")}`);
        }
      }
    }
    refresh();
  }

  async function readEntryFile(entry: FileSystemFileEntry): Promise<File> {
    return new Promise((resolve, reject) => entry.file(resolve, reject));
  }

  async function readEntryDirectory(
    entry: FileSystemDirectoryEntry
  ): Promise<FileSystemEntry[]> {
    const reader = entry.createReader();
    const all: FileSystemEntry[] = [];
    return new Promise((resolve, reject) => {
      function readBatch() {
        reader.readEntries((batch) => {
          if (batch.length === 0) {
            resolve(all);
            return;
          }
          all.push(...batch);
          readBatch();
        }, reject);
      }
      readBatch();
    });
  }

  async function collectDroppedFiles(
    entry: FileSystemEntry,
    relPath: string,
    out: { file: File; relPath: string }[]
  ) {
    if (entry.isFile) {
      const file = await readEntryFile(entry as FileSystemFileEntry);
      out.push({ file, relPath: joinPath(relPath, entry.name) });
    } else if (entry.isDirectory) {
      const children = await readEntryDirectory(entry as FileSystemDirectoryEntry);
      for (const child of children) {
        await collectDroppedFiles(child, joinPath(relPath, entry.name), out);
      }
    }
  }

  async function uploadFiles(files: { file: File; relPath: string }[]) {
    if (!currentPath || files.length === 0) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.set("targetDir", currentPath);
      form.set("overwrite", "false");
      for (const f of files) {
        form.append("files", f.file);
        form.append("relPaths", f.relPath);
      }
      const res = await fetch(`${restBasePath}/upload`, {
        method: "POST",
        body: form,
      });
      if (res.status === 409) {
        const body = await res.json().catch(() => null);
        const choice = await askConflict(body?.detail ?? t("file"));
        if (choice === "overwrite") {
          const form2 = new FormData();
          form2.set("targetDir", currentPath);
          form2.set("overwrite", "true");
          for (const f of files) {
            form2.append("files", f.file);
            form2.append("relPaths", f.relPath);
          }
          await fetch(`${restBasePath}/upload`, { method: "POST", body: form2 });
        } else if (choice === "rename") {
          const form2 = new FormData();
          form2.set("targetDir", currentPath);
          form2.set("overwrite", "false");
          for (const f of files) {
            form2.append("files", f.file);
            form2.append("relPaths", t("copySuffix", { name: f.relPath }));
          }
          await fetch(`${restBasePath}/upload`, { method: "POST", body: form2 });
        }
      } else if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ? tErrors(body.error) : t("uploadFailed"));
      }
    } finally {
      setUploading(false);
      refresh();
    }
  }

  async function handleOsDrop(dataTransfer: DataTransfer) {
    const items = Array.from(dataTransfer.items);
    const collected: { file: File; relPath: string }[] = [];
    const entriesApi = items
      .map((item) => item.webkitGetAsEntry?.())
      .filter((e): e is FileSystemEntry => !!e);
    if (entriesApi.length > 0) {
      for (const entry of entriesApi) {
        await collectDroppedFiles(entry, "", collected);
      }
    } else {
      for (const file of Array.from(dataTransfer.files)) {
        collected.push({ file, relPath: file.name });
      }
    }
    await uploadFiles(collected);
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border">
      <a ref={anchorRef} className="hidden" />
      <div className="flex items-center gap-1.5 border-b bg-muted/40 p-1.5">
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={!currentPath || currentPath === "/"}
          onClick={() => currentPath && load(parentPath(currentPath))}
          title={t("parentDirectory")}
        >
          <ArrowUp className="size-4" />
        </Button>
        <Input
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && pathInput.trim()) load(pathInput.trim());
          }}
          className="h-7 flex-1 font-mono text-xs"
        />
        <Button size="icon-sm" variant="ghost" onClick={refresh} title={t("refresh")}>
          {loading || uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b bg-muted/20 px-1.5 py-1">
        <Button size="xs" variant="ghost" onClick={() => setNewFolderOpen(true)}>
          <FolderPlus className="size-3.5" /> {t("folder")}
        </Button>
        <Button size="xs" variant="ghost" onClick={() => setNewFileOpen(true)}>
          <FilePlus className="size-3.5" /> {t("file")}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={selectedNodes.length !== 1}
          onClick={() => setRenameOpen(true)}
        >
          <Pencil className="size-3.5" /> {t("rename")}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={selectedNodes.length !== 1}
          onClick={() => setChmodOpen(true)}
        >
          <ShieldEllipsis className="size-3.5" /> {t("permissions")}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={selectedNodes.length === 0}
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="size-3.5" /> {t("delete")}
        </Button>
        <Button size="xs" variant="ghost" onClick={() => fileInputRef.current?.click()}>
          <Upload className="size-3.5" /> {t("upload")}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []).map((file) => ({
              file,
              relPath: file.name,
            }));
            e.target.value = "";
            void uploadFiles(files);
          }}
        />
        <div className="ml-auto flex items-center gap-1.5 pr-1 text-xs text-muted-foreground">
          <Label htmlFor={`hidden-${side}`} className="flex items-center gap-1">
            {showHidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
          </Label>
          <Switch
            id={`hidden-${side}`}
            size="sm"
            checked={showHidden}
            onCheckedChange={(v: boolean) => setShowHidden(v)}
          />
        </div>
      </div>

      <div
        className={cn(
          "relative min-h-[240px] flex-1 overflow-auto",
          dragOver && "outline-2 outline-dashed outline-primary -outline-offset-2"
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setDragOver(false);
          if (!currentPath) return;
          const internal = e.dataTransfer.getData(INTERNAL_DND_MIME);
          if (internal) {
            try {
              const parsed: DraggedEntry[] = JSON.parse(internal);
              await handleInternalDrop(parsed, currentPath, e.altKey);
            } catch {
              // ignore malformed payload
            }
            return;
          }
          if (e.dataTransfer.files.length > 0 || e.dataTransfer.items.length > 0) {
            await handleOsDrop(e.dataTransfer);
          }
        }}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>{t("nameColumn")}</TableHead>
              <TableHead className="w-20 text-right">{t("sizeColumn")}</TableHead>
              <TableHead className="w-32">{t("permissionsColumn")}</TableHead>
              <TableHead className="w-32">{t("modifiedColumn")}</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleEntries.map((node) => (
              <TableRow
                key={node.path}
                data-state={selected.has(node.path) ? "selected" : undefined}
                draggable
                onDragStart={(e) => {
                  const targets = selected.has(node.path)
                    ? selectedNodes
                    : [node];
                  const payload: DraggedEntry[] = targets.map((n) => ({
                    path: n.path,
                    name: n.name,
                    isDirectory: n.isDirectory,
                  }));
                  e.dataTransfer.setData(INTERNAL_DND_MIME, JSON.stringify(payload));
                  if (targets.length === 1) {
                    const url = node.isDirectory
                      ? `${window.location.origin}${restBasePath}/zip?path=${encodeURIComponent(node.path)}`
                      : `${window.location.origin}${restBasePath}/download?path=${encodeURIComponent(node.path)}`;
                    const name = node.isDirectory ? `${node.name}.zip` : node.name;
                    e.dataTransfer.setData(
                      "DownloadURL",
                      `application/octet-stream:${name}:${url}`
                    );
                  }
                }}
                onClick={(e) => toggleSelect(node, e)}
                onDoubleClick={() => {
                  if (node.isDirectory) void load(node.path);
                  else onOpenFile(connection, node);
                }}
                className="cursor-default select-none"
              >
                <TableCell>
                  {node.isDirectory ? (
                    <Folder className="size-4 text-primary" />
                  ) : (
                    <FileIcon className="size-4 text-muted-foreground" />
                  )}
                </TableCell>
                <TableCell className="max-w-[1px] truncate" title={node.name}>
                  {node.name}
                  {node.isSymlink && <span className="ml-1 text-muted-foreground">@</span>}
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground">
                  {node.isDirectory ? "" : formatSize(node.size)}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {modeToRwx(node.mode)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDate(node.mtime)}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button size="icon-sm" variant="ghost" onClick={(e) => e.stopPropagation()} />
                      }
                    >
                      <MoreVertical className="size-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {!node.isDirectory && (
                        <DropdownMenuItem
                          onClick={() => {
                            setSelected(new Set([node.path]));
                            onOpenFile(connection, node);
                          }}
                        >
                          <Pencil /> {t("openEdit")}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => {
                          setSelected(new Set([node.path]));
                          triggerDownload(node.path, node.isDirectory);
                        }}
                      >
                        <Download /> {node.isDirectory ? t("downloadAsZip") : t("download")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setSelected(new Set([node.path]));
                          setRenameOpen(true);
                        }}
                      >
                        <Pencil /> {t("rename")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setSelected(new Set([node.path]));
                          setChmodOpen(true);
                        }}
                      >
                        <ShieldEllipsis /> {t("changePermissions")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          setSelected(new Set([node.path]));
                          setDeleteOpen(true);
                        }}
                      >
                        <Trash2 /> {t("delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {visibleEntries.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  {t("directoryEmpty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <PromptDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        title={t("newFolderTitle")}
        label={t("folderNameLabel")}
        confirmLabel={t("createLabel")}
        onConfirm={handleCreateFolder}
      />
      <PromptDialog
        open={newFileOpen}
        onOpenChange={setNewFileOpen}
        title={t("newFileTitle")}
        label={t("fileNameLabel")}
        confirmLabel={t("createLabel")}
        onConfirm={handleCreateFile}
      />
      <PromptDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title={t("rename")}
        label={t("newNameLabel")}
        initialValue={selectedNodes[0]?.name ?? ""}
        confirmLabel={t("rename")}
        onConfirm={handleRename}
      />
      {selectedNodes.length === 1 && (
        <ChmodDialog
          open={chmodOpen}
          onOpenChange={setChmodOpen}
          path={selectedNodes[0].path}
          initialMode={selectedNodes[0].mode}
          onConfirmChmod={handleChmod}
          onConfirmChown={handleChown}
        />
      )}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("deleteElementsTitle", { count: selectedNodes.length })}
        description={selectedNodes.map((n) => n.name).join(", ")}
        onConfirm={handleDelete}
      />
      <ConflictDialog
        open={conflict !== null}
        onOpenChange={(open) => {
          if (!open) {
            conflict?.resolve("cancel");
            setConflict(null);
          }
        }}
        name={conflict?.name ?? ""}
        onChoose={(choice) => {
          conflict?.resolve(choice);
          setConflict(null);
        }}
      />
    </div>
  );
}
