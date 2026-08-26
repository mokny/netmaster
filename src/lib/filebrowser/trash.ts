// Reine Hilfsfunktionen für das Soft-Delete-Namensschema des Web-Dateimanagers
// - keine I/O hier, das übernehmen die Route-Handler bzw. der Sweep-Job.
// Ein gelöschtes Element landet als Geschwister-Eintrag in einem versteckten
// ".trash"-Verzeichnis INNERHALB derselben Freigabe (nicht freigaben-/
// dateisystemübergreifend), der Dateiname kodiert Löschzeitpunkt + originalen
// relativen Pfad, damit "Wiederherstellen" ohne separate DB-Tabelle auskommt.
export const TRASH_DIR_NAME = ".trash";

export function trashEntryName(relPath: string, epochMillis: number = Date.now()): string {
  return `${epochMillis}__${encodeURIComponent(relPath)}`;
}

export interface ParsedTrashEntry {
  epochMillis: number;
  originalRelPath: string;
}

export function parseTrashEntryName(filename: string): ParsedTrashEntry | null {
  const idx = filename.indexOf("__");
  if (idx === -1) return null;
  const epochMillis = Number(filename.slice(0, idx));
  if (!Number.isFinite(epochMillis) || epochMillis <= 0) return null;
  try {
    const originalRelPath = decodeURIComponent(filename.slice(idx + 2));
    if (!originalRelPath) return null;
    return { epochMillis, originalRelPath };
  } catch {
    return null;
  }
}
