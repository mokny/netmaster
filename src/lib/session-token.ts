import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/generated/prisma/client";

// Reine JWT-Logik ohne next/headers – nutzbar sowohl in Next.js Route Handlers
// als auch im custom Node-Server (server.ts), wo next/headers nicht verfügbar ist.

export const SESSION_COOKIE = "netmaster_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 Tage

export interface SessionPayload {
  sessionId: string;
  userId: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
}

// Nur die für optimistische Checks (Proxy/Middleware, WebSocket-Handshake)
// nötigen Claims aus dem JWT – enthält absichtlich kein Widerrufs-Flag,
// da das JWT selbst nie gegen die DB geprüft wird. Die maßgebliche Prüfung
// (inkl. Widerruf einzelner Sessions) läuft in getSession() (lib/auth.ts).

function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET ist nicht gesetzt.");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(
  payload: SessionPayload
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getAuthSecret());
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;

// Kurzlebiges Token für den Zwischenzustand "Passwort korrekt, TOTP-Code
// steht noch aus". Bewusst getrennt vom Session-JWT: es erzeugt KEINE
// DB-Session und trägt keine Rolle/Rechte, nur die userId.
const PRE_AUTH_TTL_SECONDS = 5 * 60;

export interface PreAuthPayload {
  purpose: "totp-pending";
  userId: string;
}

export async function createPreAuthToken(userId: string): Promise<string> {
  return new SignJWT({ purpose: "totp-pending", userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${PRE_AUTH_TTL_SECONDS}s`)
    .sign(getAuthSecret());
}

export async function verifyPreAuthToken(
  token: string
): Promise<PreAuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    if (payload.purpose !== "totp-pending" || typeof payload.userId !== "string") {
      return null;
    }
    return { purpose: "totp-pending", userId: payload.userId };
  } catch {
    return null;
  }
}
