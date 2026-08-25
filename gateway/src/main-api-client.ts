import { config } from "./config.js";

export interface GatewayServerCredentials {
  id: string;
  hostname: string;
  sshPort: number;
  sshUsername: string;
  authType: "PASSWORD" | "PRIVATE_KEY";
  secret: string;
  passphrase?: string;
}

export interface GatewayShareMember {
  email: string;
  role: "READ_ONLY" | "READ_WRITE";
}

export interface GatewayShare {
  id: string;
  name: string;
  remotePath: string;
  mountTransport: "SSHFS" | "NFS";
  quotaBytes: string | null;
  readOnlyLocked: boolean;
  members: GatewayShareMember[];
  server: GatewayServerCredentials;
}

export interface GatewayAuthResult {
  ok: boolean;
  nasUserId?: string;
  shares?: { shareId: string; role: "READ_ONLY" | "READ_WRITE"; readOnlyLocked: boolean }[];
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.mainApiUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "x-internal-secret": config.internalSecret,
      "content-type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Haupt-App-API ${path} antwortete mit ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function fetchShares(): Promise<GatewayShare[]> {
  const data = await call<{ shares: GatewayShare[] }>("/api/internal/nas/shares");
  return data.shares;
}

export async function authenticateNasUser(
  email: string,
  password: string
): Promise<GatewayAuthResult> {
  return call<GatewayAuthResult>("/api/internal/nas/auth", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function reportUsage(shareId: string, usedBytes: number): Promise<{ readOnlyLocked: boolean }> {
  return call<{ readOnlyLocked: boolean }>("/api/internal/nas/usage", {
    method: "POST",
    body: JSON.stringify({ shareId, usedBytes }),
  });
}

export async function reportMountStatus(
  shareId: string,
  active: boolean,
  error?: string
): Promise<void> {
  await call("/api/internal/nas/mount-status", {
    method: "POST",
    body: JSON.stringify({ shareId, active, error }),
  });
}
