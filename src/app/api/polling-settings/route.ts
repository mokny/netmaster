import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession, handleApiError } from "@/lib/api-helpers";
import { getOrCreatePollingSettings, refreshPollingSettingsCache } from "@/lib/monitor/polling-settings";
import { publish } from "@/lib/monitor/events";

const TOGGLE_KEYS = [
  "serverMetricsEnabled",
  "dockerContainersEnabled",
  "dockerImagesEnabled",
  "proxmoxVmsEnabled",
  "routerDevicesEnabled",
  "uptimeChecksEnabled",
  "discoveryScanEnabled",
  "topologyGraphEnabled",
  "portsEnabled",
  "dashboardLookupsEnabled",
  "wsProcessesEnabled",
  "pingEnabled",
  "advancedPollingEnabled",
] as const;

// GET ist absichtlich nur an eine gültige Session gebunden (nicht ADMIN-only):
// die Client-seitigen Live-Ansichten (Topology, Ports, Dashboard, Prozessliste)
// müssen für jede Rolle wissen, ob ihr Polling gerade global deaktiviert ist.
// Nur PATCH (das eigentliche Umschalten) ist Admins vorbehalten.
export async function GET() {
  try {
    await requireSession();
    const settings = await getOrCreatePollingSettings();
    return NextResponse.json({ settings });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    await requireRole("ADMIN");
    const body = await req.json();
    const current = await getOrCreatePollingSettings();

    const data: Record<string, boolean | number> = {};
    for (const key of TOGGLE_KEYS) {
      data[key] = body[key] !== undefined ? Boolean(body[key]) : current[key];
    }
    if (body.pingIntervalSec !== undefined) {
      data.pingIntervalSec = Math.max(5, Number(body.pingIntervalSec) || current.pingIntervalSec);
    }
    if (body.advancedPollingIntervalSec !== undefined) {
      data.advancedPollingIntervalSec = Math.max(
        5,
        Number(body.advancedPollingIntervalSec) || current.advancedPollingIntervalSec
      );
    }

    const settings = await prisma.pollingSettings.update({
      where: { id: current.id },
      data,
    });
    await refreshPollingSettingsCache();
    publish({ type: "polling-settings", settings });

    return NextResponse.json({ settings });
  } catch (err) {
    return handleApiError(err);
  }
}
