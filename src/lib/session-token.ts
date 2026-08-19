import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/generated/prisma/client";

// Reine JWT-Logik ohne next/headers – nutzbar sowohl in Next.js Route Handlers
// als auch im custom Node-Server (server.ts), wo next/headers nicht verfügbar ist.

export const SESSION_COOKIE = "netmaster_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 Tage

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: Role;
}

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
