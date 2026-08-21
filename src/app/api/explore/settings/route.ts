import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession, handleApiError, ApiError } from "@/lib/api-helpers";
import { getOrCreateExploreSettings } from "@/lib/discovery/scan";

export async function GET() {
  try {
    await requireSession();
    const settings = await getOrCreateExploreSettings();
    return NextResponse.json({ settings });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    await requireRole("EDITOR");
    const body = await req.json();
    const current = await getOrCreateExploreSettings();

    const autoScanEnabled =
      body.autoScanEnabled !== undefined ? Boolean(body.autoScanEnabled) : current.autoScanEnabled;
    const autoScanIntervalHr =
      body.autoScanIntervalHr !== undefined
        ? Number(body.autoScanIntervalHr)
        : current.autoScanIntervalHr;
    const portScanConcurrency =
      body.portScanConcurrency !== undefined
        ? Number(body.portScanConcurrency)
        : current.portScanConcurrency;

    if (!Number.isFinite(autoScanIntervalHr) || autoScanIntervalHr < 1) {
      throw new ApiError(400, "SCAN_INTERVAL_TOO_SHORT");
    }
    if (!Number.isFinite(portScanConcurrency) || portScanConcurrency < 1 || portScanConcurrency > 50) {
      throw new ApiError(400, "INVALID_PORT_SCAN_CONCURRENCY");
    }

    const settings = await prisma.exploreSettings.update({
      where: { id: current.id },
      data: { autoScanEnabled, autoScanIntervalHr, portScanConcurrency },
    });

    return NextResponse.json({ settings });
  } catch (err) {
    return handleApiError(err);
  }
}
