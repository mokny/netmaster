import { NextResponse } from "next/server";
import { getSession, hasRole, type SessionPayload } from "@/lib/auth";
import type { Role, Server as ServerModel } from "@/generated/prisma/client";

// `code` is a stable, machine-translatable identifier (SCREAMING_SNAKE_CASE)
// that must have a matching key under the `errors` namespace in every
// src/messages/*.json file — the frontend looks it up via
// useTranslations("errors")(code) instead of displaying raw server text
// (see src/lib/api-error.ts). `detail` is optional untranslated context
// (e.g. a remote command's stderr) appended as-is after the translated
// message, since that content originates outside the app and can't be
// localized.
export class ApiError extends Error {
  constructor(public status: number, public code: string, public detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new ApiError(401, "UNAUTHORIZED");
  return session;
}

export async function requireRole(minRole: Role): Promise<SessionPayload> {
  const session = await requireSession();
  if (!hasRole(session, minRole)) {
    throw new ApiError(403, "FORBIDDEN_ROLE");
  }
  return session;
}

// Blockt Docker/Proxmox-Endpunkte konsequent, wenn der Server-Owner das
// jeweilige Feature in den Server-Einstellungen nicht explizit aktiviert hat
// – unabhängig davon, ob Docker/Proxmox auf dem Zielserver installiert ist.
export function requireDockerEnabled(server: Pick<ServerModel, "dockerEnabled">) {
  if (!server.dockerEnabled) {
    throw new ApiError(403, "DOCKER_NOT_ENABLED");
  }
}

export function requireProxmoxEnabled(server: Pick<ServerModel, "proxmoxEnabled">) {
  if (!server.proxmoxEnabled) {
    throw new ApiError(403, "PROXMOX_NOT_ENABLED");
  }
}

export function requireNetworkToolsEnabled(
  server: Pick<ServerModel, "networkToolsEnabled">
) {
  if (!server.networkToolsEnabled) {
    throw new ApiError(403, "NETWORK_TOOLS_NOT_ENABLED");
  }
}

export function requireWireguardEnabled(
  server: Pick<ServerModel, "wireguardEnabled">
) {
  if (!server.wireguardEnabled) {
    throw new ApiError(403, "WIREGUARD_NOT_ENABLED");
  }
}

export function requireStorageEnabled(
  server: Pick<ServerModel, "storageEnabled">
) {
  if (!server.storageEnabled) {
    throw new ApiError(403, "STORAGE_NOT_ENABLED");
  }
}

export function handleApiError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: err.code, detail: err.detail },
      { status: err.status }
    );
  }
  console.error(err);
  return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
}
