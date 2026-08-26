import { NextResponse } from "next/server";
import type { Server as ServerModel } from "@/generated/prisma/client";
import { SftpOpError } from "@/lib/sftp-ops";
import { getFbSession } from "./session";
import {
  loadFilebrowserServer,
  requireWebUiEnabled,
  resolvePermittedShares,
  FbAccessError,
  type PermittedShare,
} from "./access";

export interface FbContext {
  server: ServerModel;
  username: string;
  password: string;
  shares: PermittedShare[];
  // Session-ID der aufrufenden Session - Routen, die die eigene
  // Sessions-Liste anzeigen/verwalten (siehe sessions/route.ts), markieren
  // damit die aktuell benutzte Session ("Diese Sitzung").
  sessionId: string;
}

// Zentrale Vorprüfung für jede Filebrowser-API-Route: Session vorhanden und
// zum aufgerufenen Server passend, Feature für den User noch aktiv (erneut
// aus der DB gelesen, nicht nur beim Login geprüft), erlaubte Freigaben
// aufgelöst. 401/403/404 je nach Fehlerursache, siehe handleFbError.
export async function requireFbContext(serverId: string): Promise<FbContext> {
  const session = await getFbSession(serverId);
  if (!session) {
    throw new FbAccessError(401, "UNAUTHORIZED");
  }
  const server = await loadFilebrowserServer(serverId);
  await requireWebUiEnabled(serverId, session.username);
  const shares = await resolvePermittedShares(server, session.username);
  return {
    server,
    username: session.username,
    password: session.password,
    shares,
    sessionId: session.sessionId,
  };
}

export function handleFbError(err: unknown): NextResponse {
  if (err instanceof FbAccessError) {
    return NextResponse.json({ error: err.code }, { status: err.status });
  }
  if (err instanceof SftpOpError) {
    const status = err.code === "NOT_FOUND" ? 404 : err.code === "EXISTS" ? 409 : 400;
    return NextResponse.json({ error: err.code, detail: err.message }, { status });
  }
  console.error(err);
  return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
}
