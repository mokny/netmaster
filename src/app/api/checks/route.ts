import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession, handleApiError, ApiError } from "@/lib/api-helpers";

// Listet alle HTTP-Health-Checks (frei stehende und serverbezogene) für die
// zentrale "Upchecker"-Übersicht.
export async function GET() {
  try {
    await requireSession();
    const checks = await prisma.serviceCheck.findMany({
      orderBy: { name: "asc" },
      include: {
        server: { select: { name: true } },
        subscribers: { select: { userId: true } },
      },
    });
    return NextResponse.json({
      checks: checks.map((c) => ({
        ...c,
        server: undefined,
        serverName: c.server?.name ?? null,
        subscriberUserIds: c.subscribers.map((s) => s.userId),
        subscribers: undefined,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

// Legt einen neuen, freistehenden (nicht an einen Server gebundenen) Check
// an. Für serverbezogene Checks weiterhin POST /api/servers/[id]/checks.
export async function POST(req: Request) {
  try {
    const session = await requireRole("EDITOR");
    const body = await req.json();

    const name = String(body.name ?? "").trim();
    const url = String(body.url ?? "").trim();
    if (!name || !url) throw new ApiError(400, "Name und URL sind erforderlich");
    if (!/^https?:\/\//i.test(url)) {
      throw new ApiError(400, "URL muss mit http:// oder https:// beginnen");
    }

    const subscriberUserIds: string[] = Array.isArray(body.subscriberUserIds)
      ? body.subscriberUserIds.filter((id: unknown) => typeof id === "string")
      : [session.userId];

    const check = await prisma.serviceCheck.create({
      data: {
        serverId: null,
        name,
        url,
        expectedStatus: Number(body.expectedStatus ?? 200),
        intervalSec: Number(body.intervalSec ?? 30),
        timeoutMs: Number(body.timeoutMs ?? 5000),
        subscribers: {
          create: subscriberUserIds.map((userId) => ({ userId })),
        },
      },
    });

    return NextResponse.json({ check }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
