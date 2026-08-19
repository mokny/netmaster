import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession, handleApiError, ApiError } from "@/lib/api-helpers";

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
    await requireRole("EDITOR");
    const { id } = await params;
    const body = await req.json();

    const name = String(body.name ?? "").trim();
    const url = String(body.url ?? "").trim();
    if (!name || !url) throw new ApiError(400, "Name und URL sind erforderlich");
    if (!/^https?:\/\//i.test(url)) {
      throw new ApiError(400, "URL muss mit http:// oder https:// beginnen");
    }

    const check = await prisma.serviceCheck.create({
      data: {
        serverId: id,
        name,
        url,
        expectedStatus: Number(body.expectedStatus ?? 200),
        intervalSec: Number(body.intervalSec ?? 30),
        timeoutMs: Number(body.timeoutMs ?? 5000),
      },
    });

    return NextResponse.json({ check }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
