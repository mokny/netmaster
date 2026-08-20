import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession, handleApiError, ApiError } from "@/lib/api-helpers";
import { getOrCreateExploreSettings } from "@/lib/discovery/scan";
import { detectDefaultRange } from "@/lib/discovery/range";

const CIDR_PATTERN = /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/;

export async function GET() {
  try {
    await requireSession();
    const settings = await getOrCreateExploreSettings();
    return NextResponse.json({ settings, detectedRange: detectDefaultRange() });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    await requireRole("EDITOR");
    const body = await req.json();
    const current = await getOrCreateExploreSettings();

    let scanRangeOverride = current.scanRangeOverride;
    if (body.scanRangeOverride !== undefined) {
      if (body.scanRangeOverride === null || body.scanRangeOverride === "") {
        scanRangeOverride = null;
      } else {
        const value = String(body.scanRangeOverride).trim();
        if (!CIDR_PATTERN.test(value)) {
          throw new ApiError(400, "Scan-Range muss im CIDR-Format vorliegen (z.B. 192.168.1.0/24)");
        }
        scanRangeOverride = value;
      }
    }

    const autoScanEnabled =
      body.autoScanEnabled !== undefined ? Boolean(body.autoScanEnabled) : current.autoScanEnabled;
    const autoScanIntervalHr =
      body.autoScanIntervalHr !== undefined
        ? Number(body.autoScanIntervalHr)
        : current.autoScanIntervalHr;

    if (!Number.isFinite(autoScanIntervalHr) || autoScanIntervalHr < 1) {
      throw new ApiError(400, "Scan-Intervall muss mindestens 1 Stunde betragen");
    }

    const settings = await prisma.exploreSettings.update({
      where: { id: current.id },
      data: { scanRangeOverride, autoScanEnabled, autoScanIntervalHr },
    });

    return NextResponse.json({ settings });
  } catch (err) {
    return handleApiError(err);
  }
}
