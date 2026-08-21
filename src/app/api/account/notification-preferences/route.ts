import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-helpers";
import { NOTIFICATION_DEFAULTS as DEFAULTS } from "@/lib/push";

const BOOL_FIELDS = [
  "offlineEnabled",
  "offlineRecoveryEnabled",
  "dockerStoppedEnabled",
  "dockerStoppedRecoveryEnabled",
  "cpuWarnEnabled",
  "cpuWarnRecoveryEnabled",
  "cpuCritEnabled",
  "cpuCritRecoveryEnabled",
  "memWarnEnabled",
  "memWarnRecoveryEnabled",
  "memCritEnabled",
  "memCritRecoveryEnabled",
  "diskWarnEnabled",
  "diskWarnRecoveryEnabled",
  "diskCritEnabled",
  "diskCritRecoveryEnabled",
  "netWarnEnabled",
  "netWarnRecoveryEnabled",
  "netCritEnabled",
  "netCritRecoveryEnabled",
] as const;

const DELAY_FIELDS = [
  "offlineDelayMin",
  "dockerStoppedDelayMin",
  "cpuWarnDelayMin",
  "cpuCritDelayMin",
  "memWarnDelayMin",
  "memCritDelayMin",
  "diskWarnDelayMin",
  "diskCritDelayMin",
  "netWarnDelayMin",
  "netCritDelayMin",
] as const;

const ENABLED_FIELDS = [
  "offlineEnabled",
  "dockerStoppedEnabled",
  "cpuWarnEnabled",
  "cpuCritEnabled",
  "memWarnEnabled",
  "memCritEnabled",
  "diskWarnEnabled",
  "diskCritEnabled",
  "netWarnEnabled",
  "netCritEnabled",
] as const;

export async function GET() {
  try {
    const session = await requireSession();
    const [servers, prefs] = await Promise.all([
      prisma.server.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.notificationPreference.findMany({ where: { userId: session.userId } }),
    ]);

    const prefByServer = new Map(prefs.map((p) => [p.serverId, p as Record<string, unknown>]));
    return NextResponse.json({
      servers: servers.map((s) => {
        const pref = prefByServer.get(s.id);
        const out: Record<string, unknown> = { serverId: s.id, serverName: s.name };
        for (const f of ENABLED_FIELDS) {
          out[f] = pref ? Boolean(pref[f]) : DEFAULTS[f];
        }
        for (const f of BOOL_FIELDS) {
          out[f] = pref ? Boolean(pref[f]) : false;
        }
        for (const f of DELAY_FIELDS) {
          out[f] = pref ? Number(pref[f] ?? 0) : 0;
        }
        return out;
      }),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const serverId = body?.serverId;
    if (typeof serverId !== "string") throw new ApiError(400, "serverId fehlt");

    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new ApiError(404, "Server nicht gefunden");

    const data: Record<string, unknown> = {};
    for (const f of ENABLED_FIELDS) data[f] = Boolean(body[f]);
    for (const f of BOOL_FIELDS) data[f] = Boolean(body[f]);
    for (const f of DELAY_FIELDS) data[f] = Math.max(0, Number(body[f] ?? 0));

    await prisma.notificationPreference.upsert({
      where: { userId_serverId: { userId: session.userId, serverId } },
      create: { userId: session.userId, serverId, ...data },
      update: data,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
