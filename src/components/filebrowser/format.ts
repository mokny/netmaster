export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${i === 0 || value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function formatDate(ms: number): string {
  if (!ms) return "-";
  return new Date(ms).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "Bitte erneut anmelden.",
  FILEBROWSER_DISABLED: "Der Web-Dateizugriff ist für dieses Konto deaktiviert.",
  INVALID_CREDENTIALS: "Benutzername oder Passwort falsch.",
  RATE_LIMITED: "Zu viele Fehlversuche. Bitte später erneut versuchen.",
  SERVER_NOT_FOUND: "Server nicht gefunden.",
  USERNAME_PASSWORD_REQUIRED: "Benutzername und Passwort erforderlich.",
  SHARE_NOT_PERMITTED: "Kein Zugriff auf diesen Ordner.",
  PATH_ESCAPES_SHARE: "Ungültiger Pfad.",
  READ_ONLY_SHARE: "Dieser Ordner ist nur lesbar.",
  EXISTS: "Es existiert bereits ein Element mit diesem Namen.",
  NOT_FOUND: "Nicht gefunden.",
  INVALID_PATH: "Ungültiger Pfad.",
  INVALID_NAME: "Ungültiger Name.",
  DIRECTORY_DOWNLOAD_REQUIRES_ZIP: "Ordner können nur als ZIP heruntergeladen werden.",
  NOT_AN_IMAGE: "Keine Vorschau verfügbar.",
  THUMBNAILS_DISABLED: "Vorschaubilder sind deaktiviert.",
  INTERNAL_ERROR: "Ein Fehler ist aufgetreten.",
  NOT_A_ZIP: "Keine ZIP-Datei.",
  SESSION_NOT_FOUND: "Sitzung nicht gefunden.",
};

export function fbErrorMessage(code: string, fallback = "Ein Fehler ist aufgetreten."): string {
  return ERROR_MESSAGES[code] ?? fallback;
}

// Grobe deutsche Relativzeit für die Sessions-Ansicht ("zuletzt aktiv vor
// X") - bewusst simpel gehalten, kein Intl.RelativeTimeFormat-Feinschliff,
// entspricht dem Rest dieses UI-Bereichs (hardcodiertes Deutsch, kein next-intl).
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "gerade eben";
  const min = Math.floor(sec / 60);
  if (min < 60) return `vor ${min} Minute${min === 1 ? "" : "n"}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `vor ${hr} Stunde${hr === 1 ? "" : "n"}`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `vor ${day} Tag${day === 1 ? "" : "en"}`;
  const month = Math.floor(day / 30);
  if (month < 12) return `vor ${month} Monat${month === 1 ? "" : "en"}`;
  const year = Math.floor(month / 12);
  return `vor ${year} Jahr${year === 1 ? "" : "en"}`;
}
