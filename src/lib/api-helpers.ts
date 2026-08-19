import { NextResponse } from "next/server";
import { getSession, hasRole, type SessionPayload } from "@/lib/auth";
import type { Role } from "@/generated/prisma/client";

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

export function handleApiError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  const message = err instanceof Error ? err.message : "Interner Fehler";
  return NextResponse.json({ error: message }, { status: 500 });
}
