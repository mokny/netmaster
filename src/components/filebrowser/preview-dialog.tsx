"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fbDownloadUrl } from "./api-client";
import type { FbEntry } from "./types";

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"]);
const TEXT_EXT = new Set([
  "txt", "md", "json", "yml", "yaml", "log", "conf", "ini", "csv", "xml", "sh", "js", "ts", "css", "html",
]);
const MAX_TEXT_PREVIEW_BYTES = 512 * 1024;

// Reine Ansicht (kein Editor) für Bilder/PDF/Text - alles andere bekommt nur
// den Hinweis "Keine Vorschau verfügbar" und muss heruntergeladen werden.
export function PreviewDialog({
  serverId,
  entry,
  onOpenChange,
}: {
  serverId: string;
  entry: FbEntry | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const ext = entry?.extension ?? "";
  const isImage = IMAGE_EXT.has(ext);
  const isPdf = ext === "pdf";
  const isText = TEXT_EXT.has(ext);

  useEffect(() => {
    setText(null);
    if (entry && isText && entry.size <= MAX_TEXT_PREVIEW_BYTES) {
      fetch(fbDownloadUrl(serverId, entry.path, true))
        .then((r) => r.text())
        .then(setText)
        .catch(() => setText("Vorschau konnte nicht geladen werden."));
    }
  }, [entry, isText, serverId]);

  return (
    <Dialog open={!!entry} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{entry?.name}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-auto">
          {entry && isImage && (
            <img
              src={fbDownloadUrl(serverId, entry.path, true)}
              alt={entry.name}
              className="mx-auto max-h-[65vh] w-auto rounded-md"
            />
          )}
          {entry && isPdf && (
            <iframe
              src={fbDownloadUrl(serverId, entry.path, true)}
              title={entry.name}
              className="h-[65vh] w-full rounded-md border"
            />
          )}
          {entry && isText && entry.size > MAX_TEXT_PREVIEW_BYTES && (
            <p className="p-6 text-center text-sm text-muted-foreground">Datei zu groß für die Vorschau.</p>
          )}
          {entry && isText && entry.size <= MAX_TEXT_PREVIEW_BYTES && (
            <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">
              {text ?? "Lädt…"}
            </pre>
          )}
          {entry && !isImage && !isPdf && !isText && (
            <p className="p-6 text-center text-sm text-muted-foreground">Keine Vorschau verfügbar.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
