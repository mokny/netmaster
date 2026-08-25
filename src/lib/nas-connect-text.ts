// Baut den kopierbaren Verbindungstext für einen NAS-User. Isomorph (kein
// server-only Import), damit sowohl Admin- als auch Self-Service-UI ihn ohne
// Round-Trip direkt im Browser zusammensetzen können.

// Base64url einer UTF-8-Zeichenkette ohne `Buffer` (im Browser nicht
// verfügbar) - liefert für dieselbe Eingabe dasselbe Ergebnis wie Node's
// Buffer.from(str, "utf8").toString("base64url").
function base64UrlFromUtf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Muss exakt mit gateway/src/samba.ts#sambaUsernameFor übereinstimmen - der
// Samba-Login-Name ist deterministisch aus der E-Mail abgeleitet, nicht die
// E-Mail selbst.
export function sambaUsernameFor(email: string): string {
  const base = email
    .toLowerCase()
    .replace(/@.*/, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 20);
  const hash = base64UrlFromUtf8(email).slice(0, 8).toLowerCase().replace(/[^a-z0-9]/g, "");
  return `nas_${base || "user"}_${hash}`.slice(0, 32);
}

export interface NasGatewayPublicSettings {
  publicHost: string;
  ftpEnabled: boolean;
  ftpPort: number;
  ftpsEnabled: boolean;
  ftpsPort: number;
  sftpPort: number;
}

export interface ConnectTextOptions {
  nasUser: { email: string; name: string };
  settings: NasGatewayPublicSettings;
  webUrl: string;
  password?: string;
  t: (key: string, values?: Record<string, string | number>) => string;
}

// `t` erwartet Keys aus dem Namespace `admin.nasConnectText` (siehe
// src/messages/*.json), damit derselbe Text-Baustein in Admin- und
// Self-Service-Kontext lokalisiert ausgegeben werden kann.
export function buildConnectionText(opts: ConnectTextOptions): string {
  const { nasUser, settings, webUrl, password, t } = opts;
  const host = settings.publicHost.trim() || t("hostPlaceholder");
  const passwordLine = password ? password : t("passwordPlaceholder");
  const smbUser = sambaUsernameFor(nasUser.email);

  const lines: string[] = [];
  lines.push(t("intro", { name: nasUser.name }));
  lines.push("");

  lines.push(`== ${t("smbHeading")} ==`);
  lines.push(t("smbAddress", { address: `\\\\${host}` }));
  lines.push(t("smbUsername", { username: smbUser }));
  lines.push(t("smbPassword", { password: passwordLine }));
  lines.push("");

  if (settings.ftpEnabled) {
    lines.push(`== FTP ==`);
    lines.push(t("ftpHost", { host, port: settings.ftpPort }));
    lines.push(t("ftpUsername", { username: nasUser.email }));
    lines.push(t("ftpPassword", { password: passwordLine }));
    lines.push("");
  }

  if (settings.ftpsEnabled) {
    lines.push(`== FTPS ==`);
    lines.push(t("ftpHost", { host, port: settings.ftpsPort }));
    lines.push(t("ftpUsername", { username: nasUser.email }));
    lines.push(t("ftpPassword", { password: passwordLine }));
    lines.push("");
  }

  lines.push(`== SFTP ==`);
  lines.push(t("ftpHost", { host, port: settings.sftpPort }));
  lines.push(t("ftpUsername", { username: nasUser.email }));
  lines.push(t("ftpPassword", { password: passwordLine }));
  lines.push("");

  lines.push(`== ${t("webHeading")} ==`);
  lines.push(t("webUrl", { url: webUrl }));
  lines.push(t("ftpUsername", { username: nasUser.email }));
  lines.push(t("ftpPassword", { password: passwordLine }));

  return lines.join("\n");
}
