import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession, handleApiError } from "@/lib/api-helpers";
import { validateCheckInput } from "@/lib/check-validation";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;
    const checks = await prisma.serviceCheck.findMany({
      where: { serverId: id },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ checks });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { id } = await params;
    const body = await req.json();
    const { name, url, checkType, latencyWarnMs } = validateCheckInput(body);
    const notifyMe = body.notifyMe === true;

    const check = await prisma.serviceCheck.create({
      data: {
        serverId: id,
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
