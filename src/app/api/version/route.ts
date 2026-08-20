import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-helpers";
import { getVersion } from "@/lib/version";

export async function GET() {
  try {
    await requireSession();
    return NextResponse.json({ version: getVersion() });
  } catch (err) {
    return handleApiError(err);
  }
}
