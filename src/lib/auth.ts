import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "./session-token";
import { LOCALE_COOKIE, isAppLocale } from "./locale";
import type { User } from "@/generated/prisma/client";

export { SESSION_COOKIE, verifySessionToken, type SessionPayload };

// Nur alle 5 Minuten schreiben, damit nicht jeder Request/Layout-Render
// einen Write auf die (SQLite-)DB auslöst.
const LAST_SEEN_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function setSessionCookie(sessionId: string, payload: SessionPayload) {
  const token = await createSessionToken(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return sessionId;
}

// Legt eine neue, in der DB verfolgte Session an (Login). Das Cookie
// enthält danach nur noch die Session-ID + signierte Nutzer-Claims für
// optimistische Checks in der Middleware.
export async function createUserSession(
  user: Pick<User, "id" | "email" | "name" | "role" | "mustChangePassword" | "locale">,
  userAgent: string
): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);
  const session = await prisma.session.create({
    data: { userId: user.id, userAgent: userAgent.slice(0, 300), expiresAt },
  });
  await setSessionCookie(session.id, {
    sessionId: session.id,
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  });

  // Account-Sprache übernimmt das NEXT_LOCALE-Cookie beim Login, damit die
  // Sprache geräteübergreifend folgt (siehe src/app/api/locale/route.ts).
  if (isAppLocale(user.locale)) {
    const store = await cookies();
    store.set(LOCALE_COOKIE, user.locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }
}

// Hat der User mindestens einen Passkey hinterlegt? Wenn ja, sind
// Passwort-Login und TOTP für diesen Account komplett gesperrt.
export async function hasActivePasskeys(userId: string): Promise<boolean> {
  const count = await prisma.webAuthnCredential.count({ where: { userId } });
  return count > 0;
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

// Beendet die aktuelle Session (Logout): DB-Eintrag widerrufen + Cookie löschen.
export async function revokeCurrentSession(): Promise<void> {
  const session = await getSession();
  if (session) {
    await prisma.session.updateMany({
      where: { id: session.sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  await clearSessionCookie();
}

// Maßgebliche Session-Prüfung (Data Access Layer): JWT-Signatur verifizieren
// und zusätzlich gegen die DB prüfen, ob die Session noch existiert und
// nicht widerrufen/abgelaufen ist. Läuft in Server Components/Route
// Handlern – NICHT in Proxy/Middleware (siehe proxy.ts).
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifySessionToken(token);
  if (!claims?.sessionId) return null;

  const session = await prisma.session.findUnique({
    where: { id: claims.sessionId },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return null;
  }

  if (Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_UPDATE_INTERVAL_MS) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
  }

  return {
    sessionId: session.id,
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    mustChangePassword: session.user.mustChangePassword,
  };
}

export const roleRank: Record<SessionPayload["role"], number> = {
  VIEWER: 0,
  EDITOR: 1,
  ADMIN: 2,
};

export function hasRole(
  session: SessionPayload | null,
  minRole: SessionPayload["role"]
): boolean {
  if (!session) return false;
  return roleRank[session.role] >= roleRank[minRole];
}
