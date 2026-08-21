import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession, handleApiError } from "@/lib/api-helpers";
import { validateCheckInput } from "@/lib/check-validation";

// Listet alle Health-Checks (frei stehende und serverbezogene, HTTP und
// Ping) für die zentrale "Upchecker"-Übersicht.
export async function GET() {
  try {
    await requireSession();
    const checks = await prisma.serviceCheck.findMany({
      orderBy: { name: "asc" },
      include: {
        server: { select: { name: true } },
      },
    });
    return NextResponse.json({
      checks: checks.map((c) => ({
        ...c,
        server: undefined,
        serverName: c.server?.name ?? null,
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
    const { name, url, checkType, latencyWarnMs } = validateCheckInput(body);
    const notifyMe = body.notifyMe !== false;

    const check = await prisma.serviceCheck.create({
      data: {
        serverId: null,
        name,
        url,
        checkType,
        expectedStatus: Number(body.expectedStatus ?? 200),
        intervalSec: Number(body.intervalSec ?? 30),
        timeoutMs: Number(body.timeoutMs ?? 5000),
        latencyWarnMs,
        ...(notifyMe && {
          subscribers: {
            create: [{ userId: session.userId, downEnabled: true }],
          },
        }),
      },
    });

    return NextResponse.json({ check }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
