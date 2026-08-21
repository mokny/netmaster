import { NextResponse } from "next/server";
import { requireRole, handleApiError } from "@/lib/api-helpers";
import { abortScan } from "@/lib/discovery/scan";

export async function POST() {
  try {
    await requireRole("EDITOR");
    const aborted = abortScan();
    return NextResponse.json({ aborted });
  } catch (err) {
    return handleApiError(err);
  }
}
