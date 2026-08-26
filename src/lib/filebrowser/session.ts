import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

// Separates Session-System für den Samba-Web-Dateimanager (/filebrowser) -
// komplett getrennt vom Admin-Login (netmaster_session/lib/auth.ts).
//
// DB-gestützt (FbSession-Modell, siehe schema.prisma) statt wie ursprünglich
// nur im Prozessspeicher: der User soll sich nicht nach jedem NetMaster-
// Neustart neu einloggen müssen, und soll seine aktiven Geräte selbst sehen/
// abmelden können - beides braucht Persistenz über einen Prozess hinaus.
// Das Passwort wird dafür AES-256-GCM-verschlüsselt abgelegt.
//
// Cookie-Name trägt bewusst die serverId: früher gab es EIN Cookie für ALLE
// Server, wodurch ein Login auf Server B die Session für Server A im selben
// Browser verdrängte. Bei praktisch unbegrenzt langlebigen Sessions (siehe
// unten) ist das ein echtes Problem, kein Rand-Bug mehr.
export function fbSessionCookieName(serverId: string): string {
  return `netmaster_fb_session_${serverId}`;
}

// Kein serverseitiges Idle-Timeout mehr (siehe Modell-Kommentar) - stattdessen
// ein reines Sicherheitsnetz: nach 1 Jahr ganz ohne Aktivität gilt eine
// Session als ungültig und wird beim nächsten Zugriffsversuch (lazy) sowie
// vom periodischen Hygiene-Sweep endgültig entfernt.
const FB_SESSION_MAX_IDLE_MS = 365 * 24 * 60 * 60 * 1000;

// Cookie-Lebensdauer selbst ist nur noch eine Obergrenze im Browser (nicht
// mehr die maßgebliche Ablauflogik, die läuft server-seitig über lastSeenAt).
const FB_COOKIE_MAX_AGE_SEC = 10 * 365 * 24 * 60 * 60;

// Wie in lib/auth.ts: lastSeenAt nicht bei jedem Request in die DB
// schreiben, sondern höchstens alle 5 Minuten.
const LAST_SEEN_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

// Legt die Session in der DB an und gibt die Session-ID zurück - das Setzen
// des Cookies ist bewusst ausgelagert (setFbSessionCookie), damit diese
// Funktion auch außerhalb eines Route-Handler-Kontexts aufrufbar bleibt.
export async function createFbSession(
  serverId: string,
  username: string,
  password: string,
  userAgent: string
): Promise<string> {
  const row = await prisma.fbSession.create({
    data: {
      serverId,
      username,
      encryptedPassword: encryptSecret(password),
      userAgent: userAgent.slice(0, 300),
    },
  });
  return row.id;
}

export async function setFbSessionCookie(serverId: string, sessionId: string): Promise<void> {
  const store = await cookies();
  store.set(fbSessionCookieName(serverId), sessionId, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    maxAge: FB_COOKIE_MAX_AGE_SEC,
  });
}

export interface FbSession {
  sessionId: string;
  serverId: string;
  username: string;
  password: string;
}

// Liest die serverId-gebundene Session-ID aus dem Cookie, schlägt in der DB
// nach, entschlüsselt das Passwort und aktualisiert lastSeenAt (throttled).
// Gibt null zurück, wenn kein/ein ungültiges/widerrufenes/uraltes Cookie
// vorliegt - ein Cookie im ALTEN Format (vor der serverId-Bindung) landet
// hier einfach als "nicht gefunden", kein Crash, die UI leitet zum Login um.
export async function getFbSession(serverId: string): Promise<FbSession | null> {
  const store = await cookies();
  const sessionId = store.get(fbSessionCookieName(serverId))?.value;
  if (!sessionId) return null;

  const row = await prisma.fbSession.findUnique({ where: { id: sessionId } });
  if (!row || row.serverId !== serverId) return null;

  if (row.revokedAt) return null;

  const now = Date.now();
  if (now - row.lastSeenAt.getTime() > FB_SESSION_MAX_IDLE_MS) {
    // Opportunistisch als widerrufen markieren, damit sie nicht mehr in der
    // Sessions-Liste des Users auftaucht, auch bevor der Hygiene-Sweep läuft.
    await prisma.fbSession
      .update({ where: { id: row.id }, data: { revokedAt: new Date() } })
      .catch(() => {});
    return null;
  }

  if (now - row.lastSeenAt.getTime() > LAST_SEEN_UPDATE_INTERVAL_MS) {
    await prisma.fbSession
      .update({ where: { id: row.id }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  }

  let password: string;
  try {
    password = decryptSecret(row.encryptedPassword);
  } catch {
    return null;
  }

  return { sessionId: row.id, serverId: row.serverId, username: row.username, password };
}

export async function destroyFbSession(serverId: string): Promise<void> {
  const store = await cookies();
  const sessionId = store.get(fbSessionCookieName(serverId))?.value;
  if (sessionId) {
    await prisma.fbSession
      .updateMany({ where: { id: sessionId, serverId }, data: { revokedAt: new Date() } })
      .catch(() => {});
  }
  store.delete(fbSessionCookieName(serverId));
}

export interface FbSessionSummary {
  id: string;
  userAgent: string;
  createdAt: Date;
  lastSeenAt: Date;
}

// Alle aktiven Sessions des Users auf diesem Server, neueste Aktivität
// zuerst - Grundlage für die Self-Service-"Sessions"-Ansicht im Explorer.
export async function listFbSessions(serverId: string, username: string): Promise<FbSessionSummary[]> {
  const rows = await prisma.fbSession.findMany({
    where: { serverId, username, revokedAt: null },
    orderBy: { lastSeenAt: "desc" },
  });
  return rows.map((r) => ({ id: r.id, userAgent: r.userAgent, createdAt: r.createdAt, lastSeenAt: r.lastSeenAt }));
}

// Widerruft genau eine Session - nur wenn sie tatsächlich zu (serverId,
// username) gehört, als Schutz davor, dass jemand eine fremde Session-ID
// errät und darüber widerruft.
export async function revokeFbSession(serverId: string, username: string, sessionId: string): Promise<boolean> {
  const result = await prisma.fbSession.updateMany({
    where: { id: sessionId, serverId, username, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}

// "Andere Geräte abmelden": widerruft alle aktiven Sessions außer der
// aktuellen.
export async function revokeOtherFbSessions(
  serverId: string,
  username: string,
  currentSessionId: string
): Promise<number> {
  const result = await prisma.fbSession.updateMany({
    where: { serverId, username, revokedAt: null, id: { not: currentSessionId } },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

// DB-Hygiene-Sweep (sweepFbSessions) lebt in session-sweep.ts, NICHT hier -
// diese Datei importiert next/headers (cookies()), was aus server.ts heraus
// (läuft über tsx außerhalb von Next.js' Bundling) zum Absturz führt (siehe
// Kommentar dort). server.ts importiert daher gezielt aus session-sweep.ts.
