import { randomUUID } from "node:crypto";
import { execOnServer, shellQuote } from "@/lib/ssh";
import { decryptSecret } from "@/lib/crypto";
import type { Server as ServerModel } from "@/generated/prisma/client";

// Marker-Kommentarzeile, die über jedem von NetMaster angelegten/bearbeiteten
// Cron-Eintrag steht: "# netmaster:job:<id> <label>". Erlaubt es, bei
// nachfolgenden Bearbeitungen/Löschungen den passenden Eintrag wiederzufinden,
// ohne fremde (nicht über NetMaster verwaltete) Zeilen anzufassen.
const MARKER_PREFIX = "# netmaster:job:";
const USERNAME_PATTERN = /^[a-z_][a-z0-9_-]{0,31}$/i;

export interface CronEntry {
  // null = fremder, nicht von NetMaster verwalteter Eintrag
  id: string | null;
  schedule: string;
  command: string;
  comment: string;
  managed: boolean;
  // Rohtext der Cron-Zeile - bei fremden Einträgen als Ankerpunkt für
  // updateCronEntry/deleteCronEntry nötig (siehe dort).
  raw: string;
}

const CRON_FIELD_PATTERN = /^[\w*/,-]+$/;

export function isValidCronSchedule(schedule: string): boolean {
  const fields = schedule.trim().split(/\s+/);
  return fields.length === 5 && fields.every((f) => CRON_FIELD_PATTERN.test(f));
}

function isCronLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return false;
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(trimmed)) return false; // Umgebungsvariable, z.B. SHELL=/bin/bash
  return trimmed.split(/\s+/).length >= 6; // 5 Zeitfelder + mind. 1 Befehlstoken
}

function splitCronLine(line: string): { schedule: string; command: string } {
  const parts = line.trim().split(/\s+/);
  return { schedule: parts.slice(0, 5).join(" "), command: parts.slice(5).join(" ") };
}

export function parseCrontab(text: string): CronEntry[] {
  const lines = text.split("\n");
  const entries: CronEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith(MARKER_PREFIX)) {
      const rest = line.slice(MARKER_PREFIX.length);
      const spaceIdx = rest.indexOf(" ");
      const id = (spaceIdx === -1 ? rest : rest.slice(0, spaceIdx)).trim();
      const comment = spaceIdx === -1 ? "" : rest.slice(spaceIdx + 1).trim();
      const next = lines[i + 1];
      if (id && next && isCronLine(next)) {
        const { schedule, command } = splitCronLine(next);
        entries.push({ id, schedule, command, comment, managed: true, raw: next });
        i++;
      }
      continue;
    }
    if (isCronLine(line)) {
      const { schedule, command } = splitCronLine(line);
      entries.push({ id: null, schedule, command, comment: "", managed: false, raw: line });
    }
  }
  return entries;
}

function markerLine(id: string, comment: string): string {
  return `${MARKER_PREFIX}${id}${comment ? ` ${comment}` : ""}`;
}

export function addCronEntry(
  text: string,
  entry: { schedule: string; command: string; comment: string }
): string {
  const id = randomUUID().replace(/-/g, "").slice(0, 20);
  const base = text.replace(/\n*$/, "");
  const prefix = base.length > 0 ? `${base}\n` : "";
  return `${prefix}${markerLine(id, entry.comment)}\n${entry.schedule} ${entry.command}\n`;
}

export function updateCronEntry(
  text: string,
  target: { id: string | null; raw: string },
  entry: { schedule: string; command: string; comment: string }
): string {
  const lines = text.split("\n");
  if (target.id) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(MARKER_PREFIX) && lines[i].slice(MARKER_PREFIX.length).split(" ")[0] === target.id) {
        lines[i] = markerLine(target.id, entry.comment);
        if (isCronLine(lines[i + 1] ?? "")) {
          lines[i + 1] = `${entry.schedule} ${entry.command}`;
        }
        return lines.join("\n");
      }
    }
    throw new Error("CRON_ENTRY_NOT_FOUND");
  }
  // Fremder Eintrag: die erste Zeile mit exakt passendem Rohtext wird durch
  // einen neuen, ab jetzt NetMaster-verwalteten Eintrag ersetzt.
  const idx = lines.findIndex((l) => l.trim() === target.raw.trim());
  if (idx === -1) throw new Error("CRON_ENTRY_NOT_FOUND");
  const id = randomUUID().replace(/-/g, "").slice(0, 20);
  lines.splice(idx, 1, markerLine(id, entry.comment), `${entry.schedule} ${entry.command}`);
  return lines.join("\n");
}

export function deleteCronEntry(text: string, target: { id: string | null; raw: string }): string {
  const lines = text.split("\n");
  if (target.id) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(MARKER_PREFIX) && lines[i].slice(MARKER_PREFIX.length).split(" ")[0] === target.id) {
        const removeCount = isCronLine(lines[i + 1] ?? "") ? 2 : 1;
        lines.splice(i, removeCount);
        return lines.join("\n");
      }
    }
    throw new Error("CRON_ENTRY_NOT_FOUND");
  }
  const idx = lines.findIndex((l) => l.trim() === target.raw.trim());
  if (idx === -1) throw new Error("CRON_ENTRY_NOT_FOUND");
  lines.splice(idx, 1);
  return lines.join("\n");
}

// Baut den Befehl (und ggf. stdin) zum Lesen/Schreiben der Crontab eines
// beliebigen Users per sudo - analog zu buildRootCommand in ssh.ts, aber mit
// wählbarem Ziel-User statt fest auf root.
function buildCrontabCommand(
  server: ServerModel,
  targetUser: string,
  baseCommand: string,
  stdinContent?: string
): { command: string; stdin?: string } {
  if (!USERNAME_PATTERN.test(targetUser)) {
    throw new Error("INVALID_CRON_USER");
  }
  if (targetUser === server.sshUsername) {
    return { command: baseCommand, stdin: stdinContent };
  }
  if (server.sshUsername === "root") {
    return { command: `sudo -u ${shellQuote(targetUser)} ${baseCommand}`, stdin: stdinContent };
  }
  if (server.encryptedSudoPassword) {
    const sudoPassword = decryptSecret(server.encryptedSudoPassword);
    return {
      command: `sudo -S -p '' -u ${shellQuote(targetUser)} ${baseCommand}`,
      stdin: `${sudoPassword}\n${stdinContent ?? ""}`,
    };
  }
  throw new Error("SUDO_PASSWORD_REQUIRED");
}

export async function readCrontab(server: ServerModel, targetUser: string): Promise<string> {
  const { command, stdin } = buildCrontabCommand(server, targetUser, "crontab -l 2>&1");
  const res = await execOnServer(server, command, 15_000, stdin);
  if (res.code !== 0) {
    if (/no crontab for/i.test(res.stdout) || /no crontab for/i.test(res.stderr)) return "";
    throw new Error(res.stderr.trim() || res.stdout.trim() || "CRONTAB_READ_FAILED");
  }
  return res.stdout;
}

export async function writeCrontab(server: ServerModel, targetUser: string, text: string): Promise<void> {
  const { command, stdin } = buildCrontabCommand(server, targetUser, "crontab -", text);
  const res = await execOnServer(server, command, 15_000, stdin);
  if (res.code !== 0) {
    throw new Error(res.stderr.trim() || "CRONTAB_WRITE_FAILED");
  }
}
