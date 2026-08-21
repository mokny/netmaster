import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { requireRole, handleApiError, ApiError } from "@/lib/api-helpers";

const SELECT = {
  id: true,
  name: true,
  type: true,
  hostname: true,
  port: true,
  useTls: true,
  username: true,
  pollIntervalSec: true,
  lastStatus: true,
  lastError: true,
  lastCheckedAt: true,
  modelName: true,
  firmwareVersion: true,
  uptimeSec: true,
  wanConnectionStatus: true,
  wanExternalIp: true,
  connectedHostsJson: true,
  wifiNetworksJson: true,
  createdAt: true,
} as const;

// Router-Verwaltung ist bewusst Admin-only, analog zur Nutzerverwaltung -
// sensible Infrastruktur (Zugangsdaten, Reboot/WLAN-Aktionen).
export async function GET() {
  try {
    await requireRole("ADMIN");
    const devices = await prisma.routerDevice.findMany({
      orderBy: { name: "asc" },
      select: SELECT,
    });
    return NextResponse.json({ devices });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireRole("ADMIN");
    const body = await req.json();

    const name = String(body.name ?? "").trim();
    const type = body.type === "REPEATER" ? "REPEATER" : "FRITZBOX";
    const hostname = String(body.hostname ?? "").trim();
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const port = Number(body.port ?? 49000);
    const useTls = Boolean(body.useTls ?? false);
    const pollIntervalSec = Number(body.pollIntervalSec ?? 60);

    if (!name || !hostname || !username || !password) {
      throw new ApiError(400, "MISSING_REQUIRED_FIELDS");
    }

    const device = await prisma.routerDevice.create({
      data: {
        name,
        type,
        hostname,
        username,
        port,
        useTls,
        pollIntervalSec,
        encryptedPassword: encryptSecret(password),
      },
      select: SELECT,
    });

    return NextResponse.json({ device }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
