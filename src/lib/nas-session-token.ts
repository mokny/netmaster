import { SignJWT, jwtVerify } from "jose";

// Eigenständige JWT-Logik für NAS-User-Sessions, bewusst eine 1:1-Kopie des
// Musters aus session-token.ts statt Wiederverwendung - NAS-Sessions dürfen
// niemals mit Webmaster-Sessions verwechselbar sein (anderes Cookie, andere
// Payload-Form, kein Role-Feld).

export const NAS_SESSION_COOKIE = "netmaster_nas_session";
const NAS_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 Tage

export interface NasSessionPayload {
  nasSessionId: string;
  nasUserId: string;
  email: string;
  name: string;
  mustChangePassword: boolean;
}

function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET ist nicht gesetzt.");
  return new TextEncoder().encode(secret);
}

export async function createNasSessionToken(
  payload: NasSessionPayload
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${NAS_SESSION_TTL_SECONDS}s`)
    .sign(getAuthSecret());
}

export async function verifyNasSessionToken(
  token: string
): Promise<NasSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    if (typeof payload.nasSessionId !== "string" || typeof payload.nasUserId !== "string") {
      return null;
    }
    return payload as unknown as NasSessionPayload;
  } catch {
    return null;
  }
}

export const NAS_SESSION_MAX_AGE = NAS_SESSION_TTL_SECONDS;

// Kurzlebiges Zwischenzustand-Token für "Passwort korrekt, TOTP-Code steht
// noch aus", analog zu PreAuthPayload in session-token.ts.
const NAS_PRE_AUTH_TTL_SECONDS = 5 * 60;

export interface NasPreAuthPayload {
  purpose: "nas-totp-pending";
  nasUserId: string;
}

export async function createNasPreAuthToken(nasUserId: string): Promise<string> {
  return new SignJWT({ purpose: "nas-totp-pending", nasUserId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${NAS_PRE_AUTH_TTL_SECONDS}s`)
    .sign(getAuthSecret());
}

export async function verifyNasPreAuthToken(
  token: string
): Promise<NasPreAuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    if (payload.purpose !== "nas-totp-pending" || typeof payload.nasUserId !== "string") {
      return null;
    }
    return { purpose: "nas-totp-pending", nasUserId: payload.nasUserId };
  } catch {
    return null;
  }
}
