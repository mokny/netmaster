import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-helpers";
import { createRegistrationOptions } from "@/lib/webauthn";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const options = await createRegistrationOptions(
      req,
      session.userId,
      session.email,
      session.name
    );
    return NextResponse.json(options);
  } catch (err) {
    return handleApiError(err);
  }
}
