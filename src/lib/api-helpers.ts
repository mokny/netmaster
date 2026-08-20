import { NextResponse } from "next/server";
import { getSession, hasRole, type SessionPayload } from "@/lib/auth";
import type { Role, Server as ServerModel } from "@/generated/prisma/client";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new ApiError(401, "Nicht angemeldet");
  return session;
}

export async function requireRole(minRole: Role): Promise<SessionPayload> {
  const session = await requireSession();
  if (!hasRole(session, minRole)) {
    throw new ApiError(403, "Keine ausreichende Berechtigung");
  }
  return session;
}

// Blockt Docker/Proxmox-Endpunkte konsequent, wenn der Server-Owner das
// jeweilige Feature in den Server-Einstellungen nicht explizit aktiviert hat
// – unabhängig davon, ob Docker/Proxmox auf dem Zielserver installiert ist.
export function requireDockerEnabled(server: Pick<ServerModel, "dockerEnabled">) {
  if (!server.dockerEnabled) {
    throw new ApiError(403, "Docker ist für diesen Server nicht aktiviert");
  }
}

export function requireProxmoxEnabled(server: Pick<ServerModel, "proxmoxEnabled">) {
  if (!server.proxmoxEnabled) {
    throw new ApiError(403, "Proxmox ist für diesen Server nicht aktiviert");
  }
}

export function requireNetworkToolsEnabled(
  server: Pick<ServerModel, "networkToolsEnabled">
) {
  if (!server.networkToolsEnabled) {
    throw new ApiError(403, "Netzwerk-Tools sind für diesen Server nicht aktiviert");
  }
}

export function handleApiError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  const message = err instanceof Error ? err.message : "Interner Fehler";
  return NextResponse.json({ error: message }, { status: 500 });
}
