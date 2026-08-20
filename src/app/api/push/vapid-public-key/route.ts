import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-helpers";

export async function GET() {
  try {
    await requireSession();
    const publicKey = process.env.VAPID_PUBLIC_KEY ?? null;
    return NextResponse.json({ publicKey });
  } catch (err) {
    return handleApiError(err);
  }
}
