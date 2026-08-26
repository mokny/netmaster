import type { Server as ServerModel } from "@/generated/prisma/client";
import { runRootScript, ensureCommand, installBlock, assertMountpoint, assertName } from "./exec";

const SAMBA_PACKAGES = ["samba"];
const SHARES_FILE = "/etc/samba/netmaster-shares.conf";
const MAIN_CONF = "/etc/samba/smb.conf";
const INCLUDE_LINE = `include = ${SHARES_FILE}`;

function ensureSamba(): string {
  return `
${ensureCommand("smbd", SAMBA_PACKAGES)}
touch ${SHARES_FILE}
if ! grep -qF ${JSON.stringify(INCLUDE_LINE)} ${MAIN_CONF} 2>/dev/null; then
  printf '\\n${INCLUDE_LINE}\\n' >> ${MAIN_CONF}
fi
`.trim();
}

function restartSmb(): string {
  return `
testparm -s >/dev/null 2>&1 || true
systemctl restart smbd 2>/dev/null || systemctl restart smb 2>/dev/null || true
`.trim();
}

// --- Installation -------------------------------------------------------------

export async function isSambaInstalled(server: ServerModel): Promise<boolean> {
  const result = await runRootScript(
    server,
    "command -v smbd >/dev/null 2>&1 && echo yes || echo no"
  );
  return result.stdout.trim() === "yes";
}

export async function installSamba(server: ServerModel): Promise<void> {
  const script = `
set -e
${installBlock(SAMBA_PACKAGES)}
touch ${SHARES_FILE}
if ! grep -qF ${JSON.stringify(INCLUDE_LINE)} ${MAIN_CONF} 2>/dev/null; then
  printf '\\n${INCLUDE_LINE}\\n' >> ${MAIN_CONF}
fi
systemctl enable --now smbd 2>/dev/null || systemctl enable --now smb 2>/dev/null || true
`.trim();
  await runRootScript(server, script, 120_000);
}

// Deinstalliert das Samba-Paket wieder vollständig (Service stoppen, Paket
// purgen, eigene Freigaben-Datei entfernen). System-User, die zuvor für
// Samba angelegt wurden, bleiben unangetastet - deren Entfernung ist eine
// bewusste Einzelaktion über removeSambaUser (removeSystemUser-Flag).
export async function uninstallSamba(server: ServerModel): Promise<void> {
  const script = `
systemctl stop smbd 2>/dev/null || systemctl stop smb 2>/dev/null || true
systemctl disable smbd 2>/dev/null || systemctl disable smb 2>/dev/null || true
if command -v apt-get >/dev/null 2>&1; then
  DEBIAN_FRONTEND=noninteractive apt-get purge -y -qq samba samba-common-bin 2>/dev/null || true
  apt-get autoremove -y -qq 2>/dev/null || true
elif command -v dnf >/dev/null 2>&1; then
  dnf remove -y -q samba 2>/dev/null || true
elif command -v yum >/dev/null 2>&1; then
  yum remove -y -q samba 2>/dev/null || true
fi
rm -f ${SHARES_FILE}
`.trim();
  await runRootScript(server, script, 120_000);
}

// --- Samba-Nutzer -------------------------------------------------------------

export async function listSambaUsers(server: ServerModel): Promise<string[]> {
  const script = `
${ensureSamba()}
${ensureCommand("pdbedit", SAMBA_PACKAGES)}
pdbedit -L 2>/dev/null | cut -d: -f1 || true
`.trim();
  const result = await runRootScript(server, script);
  return result.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// Legt bei Bedarf einen Login-losen System-User an und setzt anschließend das
// Samba-Passwort per smbpasswd. useradd schlägt fehl, wenn der User bereits
// existiert - das wird ignoriert, damit ein bestehender System-User ebenfalls
// als Samba-User nutzbar ist.
//
// Das Unix-Passwort (/etc/shadow) wird bewusst per chpasswd auf denselben
// Wert gesetzt: smbpasswd schreibt NUR in Sambas eigene tdbsam-Datenbank,
// nicht ins Unix-Passwort - ohne diesen Sync bliebe der frisch angelegte
// User in /etc/shadow passwortlos/gesperrt ('!'), und jeder SSH/PAM-Login
// (u.a. die Live-Verifikation des Web-Dateimanagers, siehe
// lib/ssh.ts#verifyPasswordAuth) würde trotz korrektem Samba-Passwort immer
// fehlschlagen.
export async function createOrUpdateSambaUser(
  server: ServerModel,
  username: string,
  password: string
): Promise<void> {
  assertName(username, "username");
  if (!password || password.length < 1) throw new Error("Password required");
  const script = `
set -e
${ensureSamba()}
id -u ${username} >/dev/null 2>&1 || useradd -M -s /usr/sbin/nologin ${username}
printf '%s\\n%s\\n' ${JSON.stringify(password)} ${JSON.stringify(password)} | smbpasswd -a -s ${username}
smbpasswd -e ${username}
# Home-Verzeichnis muss existieren, auch wenn useradd -M keins anlegt: fehlt
# es, schreibt sshd beim Session-Aufbau (chdir schlägt fehl) eine
# Warnmeldung in den Kanal, BEVOR das SFTP-Subsystem startet - das
# zerstört das SFTP-Binärprotokoll und der Web-Dateimanager kann keine
# Freigabe öffnen (Verbindung bricht mit generischem Fehler ab), obwohl
# Login/Auth einwandfrei funktionieren. Betrifft auch schon vorhandene
# User (id -u ... || ... übersprungen), daher unconditional.
HOMEDIR=$(getent passwd ${username} | cut -d: -f6)
[ -n "$HOMEDIR" ] && mkdir -p "$HOMEDIR" && chown ${username}:${username} "$HOMEDIR" && chmod 700 "$HOMEDIR"
printf '%s:%s\\n' ${JSON.stringify(username)} ${JSON.stringify(password)} | chpasswd
passwd -u ${username} >/dev/null 2>&1 || true
`.trim();
  await runRootScript(server, script);
}

// Entfernt den User zusätzlich aus den Read/Write-Listen aller Freigaben,
// damit smb.conf keine verwaisten Einträge auf einen nicht mehr
// existierenden User behält (wäre wirkungslos, aber irreführend beim
// nächsten Anzeigen/Bearbeiten einer Freigabe).
export async function removeSambaUser(
  server: ServerModel,
  username: string,
  removeSystemUser: boolean
): Promise<void> {
  assertName(username, "username");
  const shares = await listShares(server);
  const updated = shares.map((s) => ({
    ...s,
    readUsers: s.readUsers.filter((u) => u !== username),
    writeUsers: s.writeUsers.filter((u) => u !== username),
  }));
  const content = updated.length > 0 ? updated.map(serializeShare).join("\n\n") + "\n" : "";
  const script = `
smbpasswd -x ${username} 2>/dev/null || true
${removeSystemUser ? `userdel ${username} 2>/dev/null || true` : ""}
cat > ${SHARES_FILE} <<'NETMASTER_SMB_EOF'
${content}
NETMASTER_SMB_EOF
${restartSmb()}
`.trim();
  await runRootScript(server, script);
}

// --- Freigaben ------------------------------------------------------------------

export interface SambaShare {
  name: string;
  path: string;
  guestOk: boolean;
  readUsers: string[];
  writeUsers: string[];
}

const SHARE_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,32}$/;

function serializeShare(share: SambaShare): string {
  // Für per-User-Rechte muss die Freigabe immer "read only = yes" bleiben und
  // Schreibrechte ausschließlich über "write list" vergeben werden - würde
  // "read only" stattdessen global auf "no" gesetzt (sobald irgendein
  // Write-User existiert), könnten auch reine Read-User schreiben. Nur bei
  // Gastzugriff (kein per-User-Modell) bestimmt writeUsers direkt, ob der
  // Gastzugriff schreibbar ist.
  const readOnly = share.guestOk ? share.writeUsers.length === 0 : true;
  const validUsers = Array.from(new Set([...share.readUsers, ...share.writeUsers]));
  const lines = [
    `[${share.name}]`,
    `   path = ${share.path}`,
    `   browsable = yes`,
    `   guest ok = ${share.guestOk ? "yes" : "no"}`,
    `   read only = ${readOnly ? "yes" : "no"}`,
  ];
  if (!share.guestOk && validUsers.length > 0) {
    lines.push(`   valid users = ${validUsers.join(" ")}`);
  }
  if (share.writeUsers.length > 0) {
    lines.push(`   write list = ${share.writeUsers.join(" ")}`);
  }
  return lines.join("\n");
}

function parseShares(raw: string): SambaShare[] {
  const shares: SambaShare[] = [];
  let current: Partial<SambaShare> & { validUsers?: string[] } | null = null;
  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      if (current?.name) {
        shares.push(finalizeShare(current));
      }
      current = { name: sectionMatch[1], guestOk: false, readUsers: [], writeUsers: [], validUsers: [] };
      continue;
    }
    if (!current) continue;
    const kv = line.match(/^([a-zA-Z ]+?)\s*=\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].trim().toLowerCase();
    const value = kv[2].trim();
    if (key === "path") current.path = value;
    else if (key === "guest ok") current.guestOk = value.toLowerCase() === "yes";
    else if (key === "valid users") current.validUsers = value.split(/\s+/).filter(Boolean);
    else if (key === "write list") current.writeUsers = value.split(/\s+/).filter(Boolean);
  }
  if (current?.name) shares.push(finalizeShare(current));
  return shares;
}

function finalizeShare(
  current: Partial<SambaShare> & { validUsers?: string[] }
): SambaShare {
  const writeUsers = current.writeUsers ?? [];
  const validUsers = current.validUsers ?? [];
  const readUsers = current.guestOk
    ? []
    : validUsers.filter((u) => !writeUsers.includes(u));
  return {
    name: current.name!,
    path: current.path ?? "",
    guestOk: !!current.guestOk,
    readUsers,
    writeUsers,
  };
}

export async function listShares(server: ServerModel): Promise<SambaShare[]> {
  const script = `
${ensureSamba()}
cat ${SHARES_FILE} 2>/dev/null || true
`.trim();
  const result = await runRootScript(server, script);
  return parseShares(result.stdout);
}

export async function upsertShare(server: ServerModel, share: SambaShare): Promise<void> {
  if (!SHARE_NAME_PATTERN.test(share.name)) throw new Error(`Invalid share name: ${share.name}`);
  assertMountpoint(share.path);
  const shares = await listShares(server);
  const next = shares.filter((s) => s.name !== share.name);
  next.push(share);
  const content = next.map(serializeShare).join("\n\n") + "\n";
  const script = `
set -e
${ensureSamba()}
cat > ${SHARES_FILE} <<'NETMASTER_SMB_EOF'
${content}
NETMASTER_SMB_EOF
${restartSmb()}
`.trim();
  await runRootScript(server, script);
}

export async function removeShare(server: ServerModel, name: string): Promise<void> {
  if (!SHARE_NAME_PATTERN.test(name)) throw new Error(`Invalid share name: ${name}`);
  const shares = await listShares(server);
  const next = shares.filter((s) => s.name !== name);
  const content = next.length > 0 ? next.map(serializeShare).join("\n\n") + "\n" : "";
  const script = `
set -e
cat > ${SHARES_FILE} <<'NETMASTER_SMB_EOF'
${content}
NETMASTER_SMB_EOF
${restartSmb()}
`.trim();
  await runRootScript(server, script);
}
