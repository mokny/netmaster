"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePrompt } from "@/components/ui/prompt-dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Folder,
  File as FileIcon,
  Upload,
  FolderPlus,
  Trash2,
  Download,
  Link as LinkIcon,
  ChevronRight,
  Loader2,
} from "lucide-react";
import type { FileNodeDTO } from "@/lib/file-manager-types";

function formatSize(bytes: number, isDirectory: boolean): string {
  if (isDirectory) return "–";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function NasFilesPage() {
  const { shareId } = useParams<{ shareId: string }>();
  const t = useTranslations("nas.files");
  const tErrors = useTranslations("errors");
  const prompt = usePrompt();
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [path, setPath] = useState("/");
  const [entries, setEntries] = useState<FileNodeDTO[] | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setEntries(null);
    const res = await fetch(
      `/api/nas/files/${shareId}?op=list&path=${encodeURIComponent(path)}`
    );
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries ?? []);
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(tErrors(data.error ?? "INTERNAL_ERROR"));
      setEntries([]);
    }
  }, [shareId, path, tErrors]);

  useEffect(() => {
    load();
  }, [load]);

  async function onMkdir() {
    const name = await prompt({ title: t("newFolder"), label: t("folderName") });
    if (!name) return;
    const res = await fetch(
      `/api/nas/files/${shareId}?op=mkdir&path=${encodeURIComponent(`${path}/${name}`)}`,
      { method: "POST" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(tErrors(data.error ?? "INTERNAL_ERROR"));
      return;
    }
    load();
  }

  async function onDelete(entry: FileNodeDTO) {
    if (!(await confirm({ title: t("deleteTitle"), description: entry.name, variant: "destructive" })))
      return;
    const res = await fetch(
      `/api/nas/files/${shareId}?path=${encodeURIComponent(entry.path)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(tErrors(data.error ?? "INTERNAL_ERROR"));
      return;
    }
    load();
  }

  async function onCreateLink(entry: FileNodeDTO) {
    const res = await fetch("/api/nas/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareId, path: entry.path }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(tErrors(data.error ?? "INTERNAL_ERROR"));
      return;
    }
    await navigator.clipboard.writeText(`${window.location.origin}/nas-link/${data.link.token}`).catch(() => {});
    toast.success(t("linkCopied"));
  }

  async function onUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const res = await fetch(
          `/api/nas/files/${shareId}?op=write&path=${encodeURIComponent(`${path}/${file.name}`)}`,
          { method: "POST", body: file }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error(tErrors(data.error ?? "INTERNAL_ERROR"));
        }
      }
      load();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const segments = path.split("/").filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-sm">
          <button className="text-muted-foreground hover:underline" onClick={() => setPath("/")}>
            {t("root")}
          </button>
          {segments.map((seg, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="size-3 text-muted-foreground" />
              <button
                className="hover:underline"
                onClick={() => setPath(`/${segments.slice(0, i + 1).join("/")}`)}
              >
                {seg}
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => onUpload(e.target.files)}
          />
          <Button size="sm" variant="outline" onClick={onMkdir}>
            <FolderPlus className="size-4" />
            {t("newFolder")}
          </Button>
          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {t("upload")}
          </Button>
        </div>
      </div>

      {entries === null ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("size")}</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    {t("empty")}
                  </TableCell>
                </TableRow>
              )}
              {entries.map((entry) => (
                <TableRow key={entry.path}>
                  <TableCell>
                    {entry.isDirectory ? (
                      <button
                        className="flex items-center gap-2 font-medium hover:underline"
                        onClick={() => setPath(entry.path)}
                      >
                        <Folder className="size-4" />
                        {entry.name}
                      </button>
                    ) : (
                      <span className="flex items-center gap-2">
                        <FileIcon className="size-4 text-muted-foreground" />
                        {entry.name}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatSize(entry.size, entry.isDirectory)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {!entry.isDirectory && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            render={
                              <a
                                href={`/api/nas/files/${shareId}?op=read&path=${encodeURIComponent(entry.path)}`}
                                download={entry.name}
                              />
                            }
                          >
                            <Download className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => onCreateLink(entry)}
                          >
                            <LinkIcon className="size-3.5" />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => onDelete(entry)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
