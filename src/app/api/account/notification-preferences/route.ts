import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-helpers";
import { NOTIFICATION_DEFAULTS as DEFAULTS } from "@/lib/push";

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

    const prefByServer = new Map(prefs.map((p) => [p.serverId, p]));
    return NextResponse.json({
      servers: servers.map((s) => {
        const pref = prefByServer.get(s.id);
        return {
          serverId: s.id,
          serverName: s.name,
          offlineEnabled: pref?.offlineEnabled ?? DEFAULTS.offlineEnabled,
          warningEnabled: pref?.warningEnabled ?? DEFAULTS.warningEnabled,
          criticalEnabled: pref?.criticalEnabled ?? DEFAULTS.criticalEnabled,
          dockerStoppedEnabled: pref?.dockerStoppedEnabled ?? DEFAULTS.dockerStoppedEnabled,
        };
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

    const data = {
      offlineEnabled: Boolean(body.offlineEnabled),
      warningEnabled: Boolean(body.warningEnabled),
      criticalEnabled: Boolean(body.criticalEnabled),
      dockerStoppedEnabled: Boolean(body.dockerStoppedEnabled),
    };

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
