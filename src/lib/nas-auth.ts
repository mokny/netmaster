import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import {
  NAS_SESSION_COOKIE,
  NAS_SESSION_MAX_AGE,
  createNasSessionToken,
  verifyNasSessionToken,
  type NasSessionPayload,
} from "./nas-session-token";
import type { NasUser } from "@/generated/prisma/client";

export { NAS_SESSION_COOKIE, verifyNasSessionToken, type NasSessionPayload };

export async function hashNasPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyNasPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function setNasSessionCookie(
  nasSessionId: string,
  payload: NasSessionPayload
) {
  const token = await createNasSessionToken(payload);
  const store = await cookies();
  store.set(NAS_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    maxAge: NAS_SESSION_MAX_AGE,
  });
  return nasSessionId;
}

export async function createNasUserSession(
  nasUser: Pick<NasUser, "id" | "email" | "name" | "mustChangePassword">,
  userAgent: string
): Promise<void> {
  const expiresAt = new Date(Date.now() + NAS_SESSION_MAX_AGE * 1000);
  const session = await prisma.nasSession.create({
    data: { nasUserId: nasUser.id, userAgent: userAgent.slice(0, 300), expiresAt },
  });
  await setNasSessionCookie(session.id, {
    nasSessionId: session.id,
    nasUserId: nasUser.id,
    email: nasUser.email,
    name: nasUser.name,
    mustChangePassword: nasUser.mustChangePassword,
  });
}

export async function clearNasSessionCookie() {
  const store = await cookies();
  store.delete(NAS_SESSION_COOKIE);
}

export async function revokeCurrentNasSession(): Promise<void> {
  const session = await getNasSession();
  if (session) {
    await prisma.nasSession.updateMany({
      where: { id: session.nasSessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  await clearNasSessionCookie();
}

// Maßgebliche Session-Prüfung (Data Access Layer), analog getSession() in
// lib/auth.ts: JWT verifizieren und zusätzlich gegen die DB prüfen.
export async function getNasSession(): Promise<NasSessionPayload | null> {
  const store = await cookies();
  const token = store.get(NAS_SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifyNasSessionToken(token);
  if (!claims?.nasSessionId) return null;

  const session = await prisma.nasSession.findUnique({
    where: { id: claims.nasSessionId },
    include: { nasUser: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return null;
  }

  return {
    nasSessionId: session.id,
    nasUserId: session.nasUser.id,
    email: session.nasUser.email,
    name: session.nasUser.name,
    mustChangePassword: session.nasUser.mustChangePassword,
  };
}
