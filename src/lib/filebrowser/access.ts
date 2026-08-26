import path from "node:path";
import { prisma } from "@/lib/prisma";
import { listShares } from "@/lib/storage/samba";
import type { Server as ServerModel } from "@/generated/prisma/client";

// Ein einzelner Top-Level-Ordner im Web-Dateimanager entspricht genau einer
// Samba-Freigabe, auf die der User (nicht guestOk) lesend/schreibend Zugriff
// hat - siehe listShares()/SambaShare in lib/storage/samba.ts.
export interface PermittedShare {
  name: string;
  path: string;
  writable: boolean;
}

export class FbAccessError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

export async function loadFilebrowserServer(serverId: string): Promise<ServerModel> {
  try {
    return await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
  } catch {
    throw new FbAccessError(404, "SERVER_NOT_FOUND");
  }
}

// Erneut bei JEDEM Request geprüft (nicht nur beim Login), damit ein
// nachträgliches Deaktivieren durch den Admin eine laufende Session sofort
// sperrt (siehe Prisma-Modell-Kommentar).
export async function requireWebUiEnabled(serverId: string, username: string): Promise<void> {
  const row = await prisma.sambaWebUser.findUnique({
    where: { serverId_username: { serverId, username } },
  });
  if (!row?.webUiEnabled) {
    throw new FbAccessError(403, "FILEBROWSER_DISABLED");
  }
}

export async function getSambaWebUser(serverId: string, username: string) {
  return prisma.sambaWebUser.findUnique({
    where: { serverId_username: { serverId, username } },
  });
}

export async function resolvePermittedShares(
  server: ServerModel,
  username: string
): Promise<PermittedShare[]> {
  const shares = await listShares(server);
  return shares
    .filter((s) => !s.guestOk && (s.readUsers.includes(username) || s.writeUsers.includes(username)))
    .map((s) => ({ name: s.name, path: s.path, writable: s.writeUsers.includes(username) }));
}

export interface ResolvedPath {
  share: PermittedShare;
  absPath: string;
  relPath: string;
}

// Löst einen vom Client übergebenen "virtuellen Pfad" (Form
// "/{shareName}/unter/ordner") gegen die erlaubten Freigaben auf. Jede
// API-Route MUSS jeden Pfad-Parameter hierdurch schicken, bevor er an eine
// SFTP-Operation geht - zusätzlich zur eigentlichen Durchsetzung über die
// OS-Rechte des per SFTP verbundenen Unix-Users (Verteidigung in der Tiefe).
export function resolveVirtualPath(shares: PermittedShare[], virtualPath: string): ResolvedPath {
  if (typeof virtualPath !== "string" || !virtualPath) {
    throw new FbAccessError(400, "INVALID_PATH");
  }
  // path.posix.normalize löst ".."-Segmente auf - ein Fluchtversuch wie
  // "/share/../../etc" landet danach bei einem Segment[0], das keiner
  // erlaubten Freigabe entspricht, und wird unten abgelehnt.
  const normalized = path.posix.normalize("/" + virtualPath.replace(/^\/+/, ""));
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) {
    throw new FbAccessError(400, "INVALID_PATH");
  }
  const share = shares.find((s) => s.name === segments[0]);
  if (!share) {
    throw new FbAccessError(403, "SHARE_NOT_PERMITTED");
  }
  const relSegments = segments.slice(1);
  const relPath = relSegments.join("/");
  const absPath = relSegments.length > 0 ? path.posix.join(share.path, ...relSegments) : share.path;

  const root = share.path.endsWith("/") ? share.path : `${share.path}/`;
  if (absPath !== share.path && !absPath.startsWith(root)) {
    throw new FbAccessError(403, "PATH_ESCAPES_SHARE");
  }
  return { share, absPath, relPath };
}

export function requireWritable(resolved: ResolvedPath): void {
  if (!resolved.share.writable) {
    throw new FbAccessError(403, "READ_ONLY_SHARE");
  }
}

// Verhindert destruktive Operationen (löschen/umbenennen/verschieben) direkt
// auf der Freigaben-Wurzel selbst - die UI zeigt Freigaben zwar wie normale
// Ordner an, sie sind aber ein virtuelles Konstrukt (smb.conf-Eintrag), kein
// Element, das man aus sich selbst heraus in seinen eigenen Papierkorb
// verschieben o.ä. könnte.
export function requireNotShareRoot(resolved: ResolvedPath): void {
  if (resolved.relPath === "") {
    throw new FbAccessError(400, "CANNOT_MODIFY_SHARE_ROOT");
  }
}
