import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError } from "@/lib/api-helpers";

// Letzte Durchsatz-Samples für den Verlaufsgraph in der Router-Übersicht.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("ADMIN");
    const { id } = await params;
    const samples = await prisma.routerSample.findMany({
      where: { routerDeviceId: id },
      orderBy: { timestamp: "desc" },
      take: 500,
    });
    return NextResponse.json({ samples: samples.reverse() });
  } catch (err) {
    return handleApiError(err);
  }
}
