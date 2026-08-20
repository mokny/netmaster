import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { prisma } from "./prisma";

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

function isIpHost(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/g, "");
  return IPV4_RE.test(bare) || bare.includes(":");
}

// WebAuthn braucht eine stabile Domain als Relying-Party-ID – reine
// IP-Adressen lehnen Browser bei der Registrierung ab. Gibt null zurück,
// wenn per IP zugegriffen wird; Aufrufer müssen die Passkey-UI dann
// ausblenden / die Anfrage ablehnen.
export function getRelyingParty(
  req: Request
): { rpID: string; origin: string; rpName: string } | null {
  const host = req.headers.get("host");
  if (!host) return null;
  const hostname = host.split(":")[0];
  if (isIpHost(hostname) && hostname !== "localhost") return null;

  const secure = process.env.COOKIE_SECURE === "true";
  const origin = `${secure ? "https" : "http"}://${host}`;
  return { rpID: hostname, origin, rpName: "NetMaster" };
}

// Challenges sind nur für kurze Zeit gültig und werden In-Memory gehalten –
// NetMaster läuft als einzelner Node-Prozess (server.ts), kein Multi-Instance
// Setup, daher genügt das (kein Redis/DB-Overhead für einen 2-Minuten-Wert).
const CHALLENGE_TTL_MS = 2 * 60 * 1000;
const challenges = new Map<string, { challenge: string; expires: number }>();

function putChallenge(key: string, challenge: string) {
  challenges.set(key, { challenge, expires: Date.now() + CHALLENGE_TTL_MS });
}

function takeChallenge(key: string): string | null {
  const entry = challenges.get(key);
  challenges.delete(key);
  if (!entry || entry.expires < Date.now()) return null;
  return entry.challenge;
}

// --- Registrierung (authenticated, im Account-Bereich) ---

export async function createRegistrationOptions(
  req: Request,
  userId: string,
  userEmail: string,
  userName: string
) {
  const rp = getRelyingParty(req);
  if (!rp) throw new Error("Passkeys benötigen eine Domain, keine IP-Adresse.");

  const existing = await prisma.webAuthnCredential.findMany({ where: { userId } });

  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpID,
    userName: userEmail,
    userDisplayName: userName,
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports ? (c.transports.split(",") as AuthenticatorTransportFuture[]) : undefined,
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "preferred",
    },
  });

  putChallenge(`reg:${userId}`, options.challenge);
  return options;
}

export async function verifyRegistration(
  req: Request,
  userId: string,
  response: RegistrationResponseJSON
): Promise<VerifiedRegistrationResponse> {
  const rp = getRelyingParty(req);
  if (!rp) throw new Error("Passkeys benötigen eine Domain, keine IP-Adresse.");

  const expectedChallenge = takeChallenge(`reg:${userId}`);
  if (!expectedChallenge) throw new Error("Registrierung abgelaufen, bitte erneut versuchen.");

  return verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.rpID,
  });
}

// --- Login (unauthenticated, discoverable credentials) ---

const LOGIN_CHALLENGE_KEY = "login";

export async function createAuthenticationOptions(req: Request) {
  const rp = getRelyingParty(req);
  if (!rp) throw new Error("Passkeys benötigen eine Domain, keine IP-Adresse.");

  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    userVerification: "preferred",
  });

  putChallenge(`${LOGIN_CHALLENGE_KEY}:${options.challenge}`, options.challenge);
  return options;
}

export async function verifyAuthentication(
  req: Request,
  response: AuthenticationResponseJSON
): Promise<{ result: VerifiedAuthenticationResponse; credential: { id: string; userId: string } }> {
  const rp = getRelyingParty(req);
  if (!rp) throw new Error("Passkeys benötigen eine Domain, keine IP-Adresse.");

  const clientChallenge = JSON.parse(
    Buffer.from(response.response.clientDataJSON, "base64url").toString("utf8")
  ).challenge;
  const expectedChallenge = takeChallenge(`${LOGIN_CHALLENGE_KEY}:${clientChallenge}`);
  if (!expectedChallenge) throw new Error("Anmeldung abgelaufen, bitte erneut versuchen.");

  const credential = await prisma.webAuthnCredential.findUnique({
    where: { credentialId: response.id },
  });
  if (!credential) throw new Error("Unbekannter Passkey.");

  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.rpID,
    credential: {
      id: credential.credentialId,
      publicKey: Buffer.from(credential.publicKey, "base64url"),
      counter: credential.counter,
      transports: credential.transports
        ? (credential.transports.split(",") as AuthenticatorTransportFuture[])
        : undefined,
    },
  });

  return { result, credential: { id: credential.id, userId: credential.userId } };
}

type AuthenticatorTransportFuture = "ble" | "hybrid" | "internal" | "nfc" | "usb";
