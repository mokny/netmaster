import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import { fetchShares, type GatewayShare } from "./main-api-client.js";
import { mountPointFor } from "./mounts.js";

const execFileAsync = promisify(execFile);

const SMB_CONF_PATH = "/etc/samba/smb.conf";
const SMB_CONF_MARKER_START = "# --- BEGIN NETMASTER NAS SHARES (auto-generated) ---";
const SMB_CONF_MARKER_END = "# --- END NETMASTER NAS SHARES ---";

// E-Mail -> gültiger, deterministischer Unix-/Samba-Benutzername (max. 32
// Zeichen, beginnt mit Buchstabe). Da mehrere E-Mails theoretisch auf den
// gleichen sanitisierten Namen kollidieren könnten, hängen wir einen kurzen
// Hash-Suffix an.
export function sambaUsernameFor(email: string): string {
  const base = email
    .toLowerCase()
    .replace(/@.*/, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 20);
  const hash = Buffer.from(email).toString("base64url").slice(0, 8).toLowerCase().replace(/[^a-z0-9]/g, "");
  return `nas_${base || "user"}_${hash}`.slice(0, 32);
}

async function ensureLocalUser(username: string): Promise<void> {
  const exists = await execFileAsync("id", ["-u", username]).then(
    () => true,
    () => false
  );
  if (!exists) {
    await execFileAsync("useradd", ["-M", "-s", "/usr/sbin/nologin", username]);
  }
}

// Wird beim Anlegen eines NAS-Users und bei jeder Passwortänderung
// aufgerufen (Push von der Haupt-App, siehe files-api.ts) - smbpasswd
// braucht das Klartext-Passwort, das lässt sich aus dem bcrypt-Hash der
// Haupt-App nicht ableiten.
export async function setSambaPassword(email: string, password: string): Promise<void> {
  const username = sambaUsernameFor(email);
  await ensureLocalUser(username);
  await new Promise<void>((resolve, reject) => {
    const child = execFile("smbpasswd", ["-a", "-s", username], (err, _stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve();
    });
    child.stdin?.write(`${password}\n${password}\n`);
    child.stdin?.end();
  });
  await execFileAsync("smbpasswd", ["-e", username]).catch(() => {});
}

function renderShareStanza(share: GatewayShare): string {
  const validUsers = share.members.map((m) => sambaUsernameFor(m.email));
  const writeUsers = share.members
    .filter((m) => m.role === "READ_WRITE")
    .map((m) => sambaUsernameFor(m.email));

  return [
    `[nas_${share.id}]`,
    `    path = ${mountPointFor(share.id)}`,
    `    comment = ${share.name.replace(/[[\]]/g, "")}`,
    "    browseable = yes",
    `    valid users = ${validUsers.join(" ")}`,
    `    write list = ${share.readOnlyLocked ? "" : writeUsers.join(" ")}`,
    "    read only = no",
    "    force user = root",
  ].join("\n");
}

async function reloadSmbd(): Promise<void> {
  await execFileAsync("smbcontrol", ["smbd", "reload-config"]).catch(async () => {
    await execFileAsync("systemctl", ["reload", "smbd"]).catch(() => {});
  });
}

// Escaped alle Regex-Sonderzeichen in einem String, der als literaler Text
// in einen RegExp-Pattern eingebettet wird.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Regeneriert den von NetMaster verwalteten Block in smb.conf und legt für
// jedes Mitglied jeder Freigabe (falls noch nicht vorhanden) einen lokalen
// nologin-Unix-Account an - das Samba-Passwort selbst wird nicht hier,
// sondern per Push (setSambaPassword) gesetzt, sobald es sich ändert.
// Gibt zurück, ob der Durchlauf erfolgreich war (siehe startSambaSync -
// nach einem Fehlschlag, z.B. weil die Haupt-App beim Gateway-Start noch
// nicht bereit war, soll zügig erneut versucht werden statt bis zu
// intervalMs zu warten).
export async function syncSambaConfig(): Promise<boolean> {
  let shares: GatewayShare[];
  try {
    shares = await fetchShares();
  } catch (err) {
    console.error("Samba-Sync: Konnte Freigaben nicht laden:", err);
    return false;
  }

  for (const share of shares) {
    for (const member of share.members) {
      await ensureLocalUser(sambaUsernameFor(member.email)).catch((err) =>
        console.error(`Konnte lokalen Account für ${member.email} nicht anlegen:`, err)
      );
    }
  }

  const existing = await fs.readFile(SMB_CONF_PATH, "utf8").catch(() => "");
  // WICHTIG: die Marker enthalten literale Klammern ("(auto-generated)"),
  // die als ungeschützte Regex-Metazeichen NIE gematcht hätten - der alte
  // Block wurde dadurch nie entfernt, sondern bei jedem Durchlauf (alle 5
  // Minuten und bei jedem Neustart) ein weiterer, duplizierter Block
  // angehängt.
  const withoutManagedBlock = existing
    .replace(
      new RegExp(`${escapeRegExp(SMB_CONF_MARKER_START)}[\\s\\S]*?${escapeRegExp(SMB_CONF_MARKER_END)}\\n?`, "g"),
      ""
    )
    .trimEnd();

  const managedBlock = [
    SMB_CONF_MARKER_START,
    ...shares.map(renderShareStanza),
    SMB_CONF_MARKER_END,
    "",
  ].join("\n\n");

  await fs.writeFile(SMB_CONF_PATH, `${withoutManagedBlock}\n\n${managedBlock}`);
  await reloadSmbd();
  return true;
}

// Läuft nach einem Fehlschlag (z.B. Haupt-App beim Gateway-Start noch nicht
// erreichbar) zeitnah erneut, statt bis zum nächsten regulären Intervall zu
// warten - ohne das könnte eine frisch angelegte Freigabe bis zu
// intervalMs (Standard 5 Minuten) lang nicht in Samba auftauchen.
export function startSambaSync(intervalMs: number): void {
  const retryDelayMs = Math.min(intervalMs, 15_000);

  async function tick(): Promise<void> {
    const ok = await syncSambaConfig();
    setTimeout(tick, ok ? intervalMs : retryDelayMs);
  }

  tick();
}
