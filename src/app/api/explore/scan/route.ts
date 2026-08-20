import { NextResponse } from "next/server";
import { requireRole, handleApiError } from "@/lib/api-helpers";
import { getScanStatus, runDiscoveryScan } from "@/lib/discovery/scan";

export async function POST() {
  try {
    await requireRole("EDITOR");
    const status = getScanStatus();
    if (status.status !== "running") {
      void runDiscoveryScan();
    }
    return NextResponse.json({ started: true });
  } catch (err) {
    return handleApiError(err);
  }
}
