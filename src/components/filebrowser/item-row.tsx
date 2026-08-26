"use client";

import { useRef, useState } from "react";
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
  ArrowUp,
  FileArchive as ExtractIcon,
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
import { fbThumbnailUrl, fbDownloadUrl, fbZipUrl } from "./api-client";
import { formatBytes, formatDate } from "./format";
import type { FbEntry } from "./types";

const ARCHIVE_EXT = new Set(["zip", "tar", "gz", "rar", "7z", "bz2", "xz"]);
const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"]);
const VIDEO_EXT = new Set(["mp4", "mkv", "webm", "mov", "avi"]);
const AUDIO_EXT = new Set(["mp3", "wav", "flac", "ogg", "m4a"]);
const TEXT_EXT = new Set(["txt", "md", "json", "yml", "yaml", "log", "conf", "ini", "csv", "xml"]);

// Bewegungsschwelle in Pixeln zur Unterscheidung von Long-Press-Kontextmenü
// (Finger bleibt liegen) und Drag-Start (Finger bewegt sich weiter) - siehe
// onPointerDown/onPointerMove unten.
const LONG_PRESS_MS = 450;
const MOVE_THRESHOLD_PX = 10;

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
  onExtract: (entry: FbEntry) => void;
  // Drag&Drop: `entry` ist der Zielordner (oder die synthetische
  // ".."-Zeile), `sourcePaths` die verschobenen Elemente (Mehrfachauswahl-
  // fähig, siehe DragPayload unten).
  onDropMove: (sourcePaths: string[], targetEntry: FbEntry) => void;
}

// Für ".."-Zeile: kein echtes FbEntry vom Server, sondern client-seitig
// synthetisiert (siehe explorer.tsx) - navigiert direkt nach oben (kein
// Doppelklick nötig, wie in jedem echten Dateimanager) und ist ein gültiges
// Drop-Ziel, aber selbst nicht auswähl-/ziehbar.
export function isParentEntry(entry: FbEntry): boolean {
  return (entry as FbEntry & { isParentEntry?: boolean }).isParentEntry === true;
}

export const DRAG_MIME = "application/x-netmaster-fb-paths";

function ItemMenuContent({ entry, actions, isRoot }: { entry: FbEntry; actions: ItemActions; isRoot: boolean }) {
  return (
    <DropdownMenuContent align="end">
      {!entry.isDirectory && (
        <DropdownMenuItem onClick={() => actions.onDownload(entry)}>
          <Download /> Herunterladen
        </DropdownMenuItem>
      )}
      {!entry.isDirectory && entry.extension === "zip" && entry.writable && (
        <DropdownMenuItem onClick={() => actions.onExtract(entry)}>
          <ExtractIcon /> Entpacken
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
  );
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
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
            onPointerUp={(e: React.PointerEvent) => e.stopPropagation()}
          />
        }
      >
        <MoreVertical className="size-4" />
      </DropdownMenuTrigger>
      <ItemMenuContent entry={entry} actions={actions} isRoot={isRoot} />
    </DropdownMenu>
  );
}

// Gemeinsame Geste-/DnD-Logik für Listen- und Kachelansicht: Klickverhalten
// (Maus: einfach = auswählen, doppelt = öffnen; Touch: einfach = öffnen),
// Rechtsklick-Kontextmenü, Long-Press (Kontextmenü ODER Drag-Start je nach
// Fingerbewegung) sowie natives HTML5-DnD für Desktop.
function useItemGestures({
  entry,
  isRoot,
  isSelected,
  isAnyMultiSelected,
  hasSelection,
  selectedPaths,
  actions,
  dnd,
  serverId,
}: {
  entry: FbEntry;
  isRoot: boolean;
  isSelected: boolean;
  isAnyMultiSelected: boolean;
  // Ob überhaupt irgendetwas ausgewählt ist (nicht nur mehrere Elemente) -
  // sperrt den Doppelklick auf eine normale Zeile (#1), damit man nicht aus
  // Versehen ein Element öffnet, während man gerade eine Auswahl bearbeitet.
  hasSelection: boolean;
  selectedPaths: string[];
  actions: ItemActions;
  dnd: DndController;
  serverId: string;
}) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const pendingLongPress = useRef(false);
  const dragging = useRef(false);

  function clearLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    pendingLongPress.current = false;
  }

  function draggedPaths(): string[] {
    return isSelected && isAnyMultiSelected ? selectedPaths : [entry.path];
  }

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType !== "touch") return;
    // Presse IMMER tracken (auch für die ".."-Zeile), sonst greift die
    // Tap-Erkennung in onPointerUp weiter unten nicht (#2 - Bugfix: vorher
    // wurde für ".." hier komplett übersprungen, wodurch pressStart.current
    // nie gesetzt wurde und der Tap ins Leere lief).
    pressStart.current = { x: e.clientX, y: e.clientY };
    pendingLongPress.current = false;
    dragging.current = false;
    // Pointer Capture: garantiert, dass move/up/cancel für diese Geste immer
    // an DIESEM Element landen, unabhängig davon, was gerade unter dem
    // Finger liegt (#3) - nicht jedes Element unterstützt das, daher
    // try/catch.
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      // ignore - Pointer Capture nicht unterstützt, Geste läuft trotzdem
      // (nur ohne die zusätzliche Garantie) weiter.
    }
    // Für die ".."-Zeile: kein Long-Press-Kontextmenü, kein Drag - nur der
    // Tap zum Navigieren soll funktionieren, siehe onPointerUp.
    if (isParentEntry(entry)) return;
    longPressTimer.current = setTimeout(() => {
      pendingLongPress.current = true;
    }, LONG_PRESS_MS);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (e.pointerType !== "touch" || !pressStart.current) return;
    const dx = e.clientX - pressStart.current.x;
    const dy = e.clientY - pressStart.current.y;
    const dist = Math.hypot(dx, dy);
    if (dragging.current) {
      dnd.onTouchDragMove(e.clientX, e.clientY);
      return;
    }
    if (dist > MOVE_THRESHOLD_PX) {
      if (pendingLongPress.current) {
        // Long-Press war "pending" (Finger stand still bis zum Timeout) und
        // bewegt sich jetzt weiter -> Übergang in den Drag-Modus.
        dragging.current = true;
        dnd.onTouchDragStart(draggedPaths(), e.clientX, e.clientY);
      } else {
        // Bewegung, bevor der Long-Press feuern konnte -> normales Scrollen,
        // kein Geste-Handling mehr für diesen Touch.
        clearLongPress();
        pressStart.current = null;
      }
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (e.pointerType === "touch") {
      if (dragging.current) {
        dnd.onTouchDragEnd(e.clientX, e.clientY);
      } else if (pendingLongPress.current) {
        setCtxMenu({ x: e.clientX, y: e.clientY });
      } else if (pressStart.current) {
        actions.onOpen(entry);
      }
      clearLongPress();
      pressStart.current = null;
      dragging.current = false;
      return;
    }
    if (e.pointerType === "mouse" || e.pointerType === "pen") {
      // ".." navigiert sofort, unabhängig vom Auswahlstatus. Ein normaler
      // Klick auf die Zeile selbst tut ansonsten NICHTS mehr (#1) - nur die
      // Checkbox (eigenes stopPropagation) schaltet die Auswahl um.
      if (isParentEntry(entry)) {
        actions.onOpen(entry);
      }
    }
  }

  function onPointerCancel(e: React.PointerEvent) {
    if (e.pointerType !== "touch") return;
    // Geste wurde vom System unterbrochen (z.B. iOS greift kurz für eine
    // System-Geste ein, oder die Liste scrollt/re-rendert mitten im Drag) -
    // Aufräumen MUSS in jedem Fall passieren, sonst bleibt z.B. das
    // Touch-Drag-Ghost-Element für immer sichtbar (#3).
    if (dragging.current) {
      dnd.onTouchDragCancel();
    }
    clearLongPress();
    pressStart.current = null;
    dragging.current = false;
  }

  function onDoubleClick() {
    if (isParentEntry(entry)) {
      actions.onOpen(entry);
      return;
    }
    // Solange irgendetwas ausgewählt ist, soll ein Doppelklick nichts tun
    // (#1) - verhindert, dass man mitten in einer Mehrfachauswahl aus
    // Versehen ein Element öffnet.
    if (hasSelection) return;
    actions.onOpen(entry);
  }

  function onDragStart(e: React.DragEvent) {
    if (isParentEntry(entry)) {
      e.preventDefault();
      return;
    }
    const paths = draggedPaths();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(paths));
    // Firefox verlangt mindestens einen "text/plain"-Eintrag, sonst wird
    // dragstart teils gar nicht ausgelöst.
    e.dataTransfer.setData("text/plain", paths.join("\n"));

    // #5: eigenes, kleines Drag-Image statt des automatischen Browser-
    // Snapshots der Zeile (der laut Bugreport fälschlich umliegenden Inhalt
    // mit einfängt) - ein kurzlebiges, unsichtbar platziertes Badge-Element,
    // im selben Stil wie das Touch-Drag-Ghost (siehe explorer.tsx).
    const label = paths.length > 1 ? `${paths.length} Elemente` : entry.name;
    const badge = document.createElement("div");
    badge.textContent = label;
    badge.className =
      "pointer-events-none fixed -top-96 -left-96 rounded-lg bg-popover px-3 py-1.5 text-xs font-medium text-popover-foreground shadow-lg ring-1 ring-primary";
    document.body.appendChild(badge);
    e.dataTransfer.setDragImage(badge, 10, 10);
    // Der Browser erfasst das Drag-Image synchron während dragstart -
    // danach sicher wieder entfernbar.
    setTimeout(() => badge.remove(), 0);

    // #6: Drag-out aus dem Browser aufs Betriebssystem (Datei-Explorer/
    // Desktop) - nur bei genau einem gezogenen Element (Mehrfachauswahl wird
    // absichtlich übersprungen, analog zum Admin-Dateimanager, siehe
    // file-panel.tsx). Datei -> Direkt-Download-Route, Ordner -> ZIP-Route.
    if (paths.length === 1) {
      const origin = window.location.origin;
      if (entry.isDirectory) {
        const url = `${origin}${fbZipUrl(serverId, [entry.path])}`;
        e.dataTransfer.setData("DownloadURL", `application/octet-stream:${entry.name}.zip:${url}`);
      } else {
        const url = `${origin}${fbDownloadUrl(serverId, entry.path)}`;
        e.dataTransfer.setData("DownloadURL", `application/octet-stream:${entry.name}:${url}`);
      }
    }
  }

  const isDropTarget = entry.isDirectory && (isParentEntry(entry) || entry.writable);
  const [dragOverSelf, setDragOverSelf] = useState(false);

  function onDragOver(e: React.DragEvent) {
    if (!isDropTarget) return;
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverSelf(true);
  }

  function onDragLeave() {
    setDragOverSelf(false);
  }

  function onDrop(e: React.DragEvent) {
    if (!isDropTarget) return;
    e.preventDefault();
    setDragOverSelf(false);
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) return;
    try {
      const paths = JSON.parse(raw) as string[];
      if (paths.includes(entry.path)) return; // nicht auf sich selbst droppen
      actions.onDropMove(paths, entry);
    } catch {
      // ignore malformed payload
    }
  }

  const isTouchDropTarget = isDropTarget && dnd.touchDropTargetPath === entry.path;

  return {
    ctxMenu,
    setCtxMenu,
    handlers: {
      onContextMenu,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onDoubleClick,
      draggable: !isParentEntry(entry) && !isRoot,
      onDragStart,
      onDragOver,
      onDragLeave,
      onDrop,
    },
    dragOver: dragOverSelf || isTouchDropTarget,
  };
}

// Steuert das custom Touch-DnD (Ghost-Element + Drop-Ziel-Erkennung über
// document.elementFromPoint) - lebt in explorer.tsx als gemeinsamer State,
// wird über Props durchgereicht, damit alle Zeilen denselben Ghost/Highlight
// referenzieren.
export interface DndController {
  touchDropTargetPath: string | null;
  onTouchDragStart: (paths: string[], x: number, y: number) => void;
  onTouchDragMove: (x: number, y: number) => void;
  onTouchDragEnd: (x: number, y: number) => void;
  // Geste wurde abgebrochen (pointercancel) statt regulär beendet - räumt
  // Ghost/Highlight-State auf, versucht aber KEINEN Drop (Position bei
  // Abbruch unzuverlässig/irrelevant), siehe #3.
  onTouchDragCancel: () => void;
}

// #4: Kontextmenü-Positionierung per rechtem Klick / Long-Press. Vorher: ein
// per `className="hidden"` (display:none) ausgeblendeter DropdownMenuTrigger
// kombiniert mit einem synthetischen `anchor`-Objekt an DropdownMenuContent.
// Ein display:none-Element hat KEINE Layout-Geometrie, und Base UIs eigene
// ContextMenu-Implementierung (siehe node_modules/@base-ui/react/context-menu)
// verwendet für genau diesen Anwendungsfall (Menü an Cursor-Koordinaten ohne
// sichtbaren Trigger) einen ECHTEN, aber unsichtbar via `opacity:0` +
// `pointer-events:none` platzierten Trigger, dessen Position per Inline-Style
// aktualisiert wird - plus `positionMethod="fixed"`, damit die Positionierung
// konsistent zu den (Viewport-relativen) `clientX`/`clientY`-Koordinaten des
// Klicks berechnet wird (der Default `positionMethod="absolute"` bezieht sich
// nicht in jedem Layout zuverlässig auf denselben Referenzpunkt). Diese
// Kombination ist der von Base UI selbst verwendete, getestete Ansatz -
// nachgebaut hier, weil wir die Öffnung/Positionierung manuell aus dem
// bestehenden Long-Press-/Rechtsklick-Gesture-Code heraus steuern (kein
// <ContextMenu.Root>-Wrapper, siehe useItemGestures oben).
function RowContextMenu({
  ctxMenu,
  setCtxMenu,
  entry,
  actions,
  isRoot,
}: {
  ctxMenu: { x: number; y: number } | null;
  setCtxMenu: (v: { x: number; y: number } | null) => void;
  entry: FbEntry;
  actions: ItemActions;
  isRoot: boolean;
}) {
  return (
    <DropdownMenu open={!!ctxMenu} onOpenChange={(open) => !open && setCtxMenu(null)}>
      <DropdownMenuTrigger
        render={
          <span
            style={{
              position: "fixed",
              left: ctxMenu?.x ?? -9999,
              top: ctxMenu?.y ?? -9999,
              width: 0,
              height: 0,
              opacity: 0,
              pointerEvents: "none",
            }}
          />
        }
      />
      <DropdownMenuContent align="start" side="bottom" positionMethod="fixed">
        <ItemMenuContent entry={entry} actions={actions} isRoot={isRoot} />
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
  isAnyMultiSelected,
  hasSelection,
  selectedPaths,
  dnd,
}: {
  entry: FbEntry;
  selected: boolean;
  onToggleSelect: (checked: boolean) => void;
  actions: ItemActions;
  showThumbnails: boolean;
  serverId: string;
  isRoot?: boolean;
  isAnyMultiSelected: boolean;
  hasSelection: boolean;
  selectedPaths: string[];
  dnd: DndController;
}) {
  const isImage = !entry.isDirectory && entry.extension && IMAGE_EXT.has(entry.extension);
  const parent = isParentEntry(entry);
  const { ctxMenu, setCtxMenu, handlers, dragOver } = useItemGestures({
    entry,
    isRoot,
    isSelected: selected,
    isAnyMultiSelected,
    hasSelection,
    selectedPaths,
    actions,
    dnd,
    serverId,
  });

  return (
    <div
      className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted data-selected:bg-accent data-dragover:bg-primary/10 data-dragover:ring-1 data-dragover:ring-primary md:grid md:grid-cols-[1fr_7rem_10rem_5rem_2.25rem] md:items-center md:gap-3"
      data-selected={selected || undefined}
      data-dragover={dragOver || undefined}
      data-fb-drop-target={entry.isDirectory ? entry.path : undefined}
      {...handlers}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 md:flex-none">
        {!parent && (
          <span
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            <Checkbox checked={selected} onCheckedChange={(c) => onToggleSelect(!!c)} />
          </span>
        )}
        {parent ? (
          <ArrowUp className="size-5 shrink-0 text-muted-foreground" />
        ) : showThumbnails && isImage ? (
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
          <p className="truncate text-sm">{parent ? ".." : entry.name}</p>
          <p className="text-xs text-muted-foreground md:hidden">
            {parent ? "Übergeordneter Ordner" : entry.isDirectory ? "Ordner" : formatBytes(entry.size)} ·{" "}
            {parent ? "" : formatDate(entry.mtime)}
          </p>
        </div>
      </div>
      <p className="hidden truncate text-xs text-muted-foreground md:block">
        {parent || entry.isDirectory ? "—" : formatBytes(entry.size)}
      </p>
      <p className="hidden truncate text-xs text-muted-foreground md:block">{parent ? "—" : formatDate(entry.mtime)}</p>
      <p className="hidden truncate text-xs text-muted-foreground md:block">
        {parent ? "—" : entry.isDirectory ? "Ordner" : (entry.extension ?? "Datei")}
      </p>
      {!parent && (
        <span
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <ItemMenu entry={entry} actions={actions} isRoot={isRoot} />
        </span>
      )}
      {!parent && <RowContextMenu ctxMenu={ctxMenu} setCtxMenu={setCtxMenu} entry={entry} actions={actions} isRoot={isRoot} />}
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
  isAnyMultiSelected,
  hasSelection,
  selectedPaths,
  dnd,
}: {
  entry: FbEntry;
  selected: boolean;
  onToggleSelect: (checked: boolean) => void;
  actions: ItemActions;
  showThumbnails: boolean;
  serverId: string;
  isRoot?: boolean;
  isAnyMultiSelected: boolean;
  hasSelection: boolean;
  selectedPaths: string[];
  dnd: DndController;
}) {
  const isImage = !entry.isDirectory && entry.extension && IMAGE_EXT.has(entry.extension);
  const parent = isParentEntry(entry);
  const { ctxMenu, setCtxMenu, handlers, dragOver } = useItemGestures({
    entry,
    isRoot,
    isSelected: selected,
    isAnyMultiSelected,
    hasSelection,
    selectedPaths,
    actions,
    dnd,
    serverId,
  });

  return (
    <div
      className="group relative flex flex-col items-center gap-1.5 rounded-lg border border-transparent p-2 hover:bg-muted data-selected:border-primary data-selected:bg-accent data-dragover:bg-primary/10 data-dragover:ring-1 data-dragover:ring-primary"
      data-selected={selected || undefined}
      data-dragover={dragOver || undefined}
      data-fb-drop-target={entry.isDirectory ? entry.path : undefined}
      {...handlers}
    >
      {!parent && (
        <span
          className="absolute top-1 left-1"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <Checkbox checked={selected} onCheckedChange={(c) => onToggleSelect(!!c)} />
        </span>
      )}
      {!parent && (
        <span
          className="absolute top-0.5 right-0.5"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <ItemMenu entry={entry} actions={actions} isRoot={isRoot} />
        </span>
      )}
      {parent ? (
        <ArrowUp className="size-10 text-muted-foreground" />
      ) : showThumbnails && isImage ? (
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
      <p className="w-full truncate text-center text-xs">{parent ? ".." : entry.name}</p>
      {!parent && <RowContextMenu ctxMenu={ctxMenu} setCtxMenu={setCtxMenu} entry={entry} actions={actions} isRoot={isRoot} />}
    </div>
  );
}
