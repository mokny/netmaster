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
}

// Zentrale Vorprüfung für jede Filebrowser-API-Route: Session vorhanden und
// zum aufgerufenen Server passend, Feature für den User noch aktiv (erneut
// aus der DB gelesen, nicht nur beim Login geprüft), erlaubte Freigaben
// aufgelöst. 401/403/404 je nach Fehlerursache, siehe handleFbError.
export async function requireFbContext(serverId: string): Promise<FbContext> {
  const session = await getFbSession();
  if (!session || session.serverId !== serverId) {
    throw new FbAccessError(401, "UNAUTHORIZED");
  }
  const server = await loadFilebrowserServer(serverId);
  await requireWebUiEnabled(serverId, session.username);
  const shares = await resolvePermittedShares(server, session.username);
  return { server, username: session.username, password: session.password, shares };
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
