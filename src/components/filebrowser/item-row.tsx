"use client";

import {
  Folder,
  File,
  FileText,
  FileImage,
  FileArchive,
  FileVideo,
  FileAudio,
  MoreVertical,
  Download,
  Pencil,
  FolderInput,
  Copy,
  Trash2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fbThumbnailUrl } from "./api-client";
import { formatBytes, formatDate } from "./format";
import type { FbEntry } from "./types";

const ARCHIVE_EXT = new Set(["zip", "tar", "gz", "rar", "7z", "bz2", "xz"]);
const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"]);
const VIDEO_EXT = new Set(["mp4", "mkv", "webm", "mov", "avi"]);
const AUDIO_EXT = new Set(["mp3", "wav", "flac", "ogg", "m4a"]);
const TEXT_EXT = new Set(["txt", "md", "json", "yml", "yaml", "log", "conf", "ini", "csv", "xml"]);

function FileIcon({ extension }: { extension: string | null }) {
  const cls = "size-5 text-muted-foreground";
  if (!extension) return <File className={cls} />;
  if (IMAGE_EXT.has(extension)) return <FileImage className={cls} />;
  if (ARCHIVE_EXT.has(extension)) return <FileArchive className={cls} />;
  if (VIDEO_EXT.has(extension)) return <FileVideo className={cls} />;
  if (AUDIO_EXT.has(extension)) return <FileAudio className={cls} />;
  if (TEXT_EXT.has(extension)) return <FileText className={cls} />;
  return <File className={cls} />;
}

export interface ItemActions {
  onOpen: (entry: FbEntry) => void;
  onDownload: (entry: FbEntry) => void;
  onRename: (entry: FbEntry) => void;
  onMove: (entry: FbEntry) => void;
  onCopy: (entry: FbEntry) => void;
  onDelete: (entry: FbEntry) => void;
}

// isRoot: Eintrag ist eine Freigabe selbst (Top-Level im Explorer), kein
// echtes Dateisystem-Element - umbenennen/verschieben/löschen ergeben dafür
// keinen Sinn (die API lehnt das serverseitig ohnehin ab, siehe
// requireNotShareRoot), Download/Kopieren der kompletten Freigabe bleibt sinnvoll.
function ItemMenu({ entry, actions, isRoot }: { entry: FbEntry; actions: ItemActions; isRoot: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" onClick={(e: React.MouseEvent) => e.stopPropagation()} />
        }
      >
        <MoreVertical className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!entry.isDirectory && (
          <DropdownMenuItem onClick={() => actions.onDownload(entry)}>
            <Download /> Herunterladen
          </DropdownMenuItem>
        )}
        {entry.writable && !isRoot && (
          <DropdownMenuItem onClick={() => actions.onRename(entry)}>
            <Pencil /> Umbenennen
          </DropdownMenuItem>
        )}
        {entry.writable && !isRoot && (
          <DropdownMenuItem onClick={() => actions.onMove(entry)}>
            <FolderInput /> Verschieben
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => actions.onCopy(entry)}>
          <Copy /> Kopieren
        </DropdownMenuItem>
        {entry.writable && !isRoot && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => actions.onDelete(entry)}>
              <Trash2 /> Löschen
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ItemListRow({
  entry,
  selected,
  onToggleSelect,
  actions,
  showThumbnails,
  serverId,
  isRoot = false,
}: {
  entry: FbEntry;
  selected: boolean;
  onToggleSelect: (checked: boolean) => void;
  actions: ItemActions;
  showThumbnails: boolean;
  serverId: string;
  isRoot?: boolean;
}) {
  const isImage = !entry.isDirectory && entry.extension && IMAGE_EXT.has(entry.extension);
  return (
    <div
      className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted data-selected:bg-accent"
      data-selected={selected || undefined}
      onClick={() => actions.onOpen(entry)}
    >
      <span onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={selected} onCheckedChange={(c) => onToggleSelect(!!c)} />
      </span>
      {showThumbnails && isImage ? (
        <img
          src={fbThumbnailUrl(serverId, entry.path)}
          alt=""
          className="size-8 shrink-0 rounded object-cover"
          loading="lazy"
        />
      ) : entry.isDirectory ? (
        <Folder className="size-5 shrink-0 text-primary" />
      ) : (
        <span className="shrink-0">
          <FileIcon extension={entry.extension} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{entry.name}</p>
        <p className="text-xs text-muted-foreground">
          {entry.isDirectory ? "Ordner" : formatBytes(entry.size)} · {formatDate(entry.mtime)}
        </p>
      </div>
      <span onClick={(e) => e.stopPropagation()}>
        <ItemMenu entry={entry} actions={actions} isRoot={isRoot} />
      </span>
    </div>
  );
}

export function ItemGridTile({
  entry,
  selected,
  onToggleSelect,
  actions,
  showThumbnails,
  serverId,
  isRoot = false,
}: {
  entry: FbEntry;
  selected: boolean;
  onToggleSelect: (checked: boolean) => void;
  actions: ItemActions;
  showThumbnails: boolean;
  serverId: string;
  isRoot?: boolean;
}) {
  const isImage = !entry.isDirectory && entry.extension && IMAGE_EXT.has(entry.extension);
  return (
    <div
      className="group relative flex flex-col items-center gap-1.5 rounded-lg border border-transparent p-2 hover:bg-muted data-selected:border-primary data-selected:bg-accent"
      data-selected={selected || undefined}
      onClick={() => actions.onOpen(entry)}
    >
      <span className="absolute top-1 left-1" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={selected} onCheckedChange={(c) => onToggleSelect(!!c)} />
      </span>
      <span className="absolute top-0.5 right-0.5" onClick={(e) => e.stopPropagation()}>
        <ItemMenu entry={entry} actions={actions} isRoot={isRoot} />
      </span>
      {showThumbnails && isImage ? (
        <img
          src={fbThumbnailUrl(serverId, entry.path)}
          alt=""
          className="size-16 rounded object-cover"
          loading="lazy"
        />
      ) : entry.isDirectory ? (
        <Folder className="size-10 text-primary" />
      ) : (
        <FileIcon extension={entry.extension} />
      )}
      <p className="w-full truncate text-center text-xs">{entry.name}</p>
    </div>
  );
}
