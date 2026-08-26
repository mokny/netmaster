import crypto from "node:crypto";
import { cookies } from "next/headers";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

// Separates Session-System für den Samba-Web-Dateimanager (/filebrowser) -
// komplett getrennt vom Admin-Login (netmaster_session/lib/auth.ts). Es gibt
// KEINEN DB-Eintrag: Sessions leben ausschließlich in diesem Prozessspeicher
// und sind damit bewusst NICHT über einen Neustart hinweg gültig (User loggt
// sich danach erneut ein - das Passwort wird nirgends dauerhaft abgelegt).
export const FB_SESSION_COOKIE = "netmaster_fb_session";

// 12h gleitendes Idle-Timeout, aktualisiert bei jedem Request.
const FB_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

interface FbSessionEntry {
  serverId: string;
  username: string;
  // AES-256-GCM-verschlüsselt über denselben Master-Key wie Server.encryptedSecret
  // (siehe lib/crypto.ts) - NIE im Klartext im Speicher liegen lassen, auch
  // wenn es sich "nur" um Prozessspeicher handelt (z.B. Heap-Dumps).
  encryptedPassword: string;
  createdAt: number;
  lastSeenAt: number;
}

// Modul-scope Map: überlebt über Requests hinweg (gleicher Node-Prozess),
// wird beim Neustart geleert - so vom User akzeptiert.
const sessions = new Map<string, FbSessionEntry>();

function sweepExpired() {
  const now = Date.now();
  for (const [id, entry] of sessions) {
    if (now - entry.lastSeenAt > FB_SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

// Periodischer Sweep zusätzlich zum lazy Sweep bei getFbSession(), damit
// abgelaufene Einträge auch ohne weiteren Traffic irgendwann freigegeben
// werden. unref(), damit der Timer den Prozess nicht am Beenden hindert.
const sweepTimer = setInterval(sweepExpired, 15 * 60 * 1000);
sweepTimer.unref?.();

// Legt die Session im Speicher an und gibt die Session-ID zurück - das
// Setzen des Cookies ist bewusst ausgelagert (setFbSessionCookie), damit
// diese Funktion auch außerhalb eines Route-Handler-Kontexts aufrufbar bleibt
// (Split-Pattern wie setSessionCookie/createUserSession in lib/auth.ts).
export async function createFbSession(
  serverId: string,
  username: string,
  password: string
): Promise<string> {
  sweepExpired();
  const sessionId = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  sessions.set(sessionId, {
    serverId,
    username,
    encryptedPassword: encryptSecret(password),
    createdAt: now,
    lastSeenAt: now,
  });
  return sessionId;
}

export async function setFbSessionCookie(sessionId: string): Promise<void> {
  const store = await cookies();
  store.set(FB_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    maxAge: FB_SESSION_TTL_MS / 1000,
  });
}

export interface FbSession {
  serverId: string;
  username: string;
  password: string;
}

// Liest die Session-ID aus dem Cookie, schlägt im Speicher nach, entschlüsselt
// das Passwort und aktualisiert lastSeenAt (gleitendes Timeout). Gibt null
// zurück, wenn kein/ein ungültiges/abgelaufenes Cookie vorliegt.
export async function getFbSession(): Promise<FbSession | null> {
  const store = await cookies();
  const sessionId = store.get(FB_SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const entry = sessions.get(sessionId);
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.lastSeenAt > FB_SESSION_TTL_MS) {
    sessions.delete(sessionId);
    return null;
  }
  entry.lastSeenAt = now;

  return {
    serverId: entry.serverId,
    username: entry.username,
    password: decryptSecret(entry.encryptedPassword),
  };
}

export async function destroyFbSession(): Promise<void> {
  const store = await cookies();
  const sessionId = store.get(FB_SESSION_COOKIE)?.value;
  if (sessionId) sessions.delete(sessionId);
  store.delete(FB_SESSION_COOKIE);
}
