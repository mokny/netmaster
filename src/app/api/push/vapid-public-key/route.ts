import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-helpers";
import { ensureVapidKeys } from "@/lib/push";

export async function GET() {
  try {
    await requireSession();
    const { publicKey } = await ensureVapidKeys();
    return NextResponse.json({ publicKey });
  } catch (err) {
    return handleApiError(err);
  }
}
