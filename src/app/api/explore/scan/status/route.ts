import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-helpers";
import { getScanStatus } from "@/lib/discovery/scan";

export async function GET() {
  try {
    await requireSession();
    return NextResponse.json(getScanStatus());
  } catch (err) {
    return handleApiError(err);
  }
}
