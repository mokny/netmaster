import { NextResponse } from "next/server";
import { createAuthenticationOptions } from "@/lib/webauthn";

export async function POST(req: Request) {
  try {
    const options = await createAuthenticationOptions(req);
    return NextResponse.json(options);
  } catch (err) {
    const detail = err instanceof Error ? err.message : undefined;
    return NextResponse.json({ error: "PASSKEY_LOGIN_FAILED", detail }, { status: 400 });
  }
}
