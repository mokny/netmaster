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
};

export function fbErrorMessage(code: string, fallback = "Ein Fehler ist aufgetreten."): string {
  return ERROR_MESSAGES[code] ?? fallback;
}
