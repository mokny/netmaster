import { NextResponse } from "next/server";
import { getNasSession, type NasSessionPayload } from "@/lib/nas-auth";

// Analog zu ApiError/handleApiError in api-helpers.ts, aber für die
// NAS-Weboberfläche - bewusst eine eigene Klasse, damit ein NAS-Request
// niemals versehentlich Webmaster-Fehlercodes/-Übersetzungen mitbenutzt.
export class NasApiError extends Error {
  constructor(public status: number, public code: string, public detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

export async function requireNasSession(): Promise<NasSessionPayload> {
  const session = await getNasSession();
  if (!session) throw new NasApiError(401, "UNAUTHORIZED");
  return session;
}

export function handleNasApiError(err: unknown): NextResponse {
  if (err instanceof NasApiError) {
    return NextResponse.json(
      { error: err.code, detail: err.detail },
      { status: err.status }
    );
  }
  console.error(err);
  return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
}
