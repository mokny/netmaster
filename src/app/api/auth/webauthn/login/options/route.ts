import { NextResponse } from "next/server";
import { createAuthenticationOptions } from "@/lib/webauthn";

export async function POST(req: Request) {
  try {
    const options = await createAuthenticationOptions(req);
    return NextResponse.json(options);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fehler beim Passkey-Login";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
