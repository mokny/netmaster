import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-helpers";
import { runServiceCheck } from "@/lib/monitor/collect";

// Stößt einen sofortigen Check außerhalb des regulären Intervalls an (z.B.
// aus dem Warnung/Kritisch-Modal) und liefert das aktualisierte Ergebnis zurück.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ checkId: string }> }
) {
  try {
    await requireSession();
    const { checkId } = await params;
    const check = await prisma.serviceCheck.findUniqueOrThrow({ where: { id: checkId } });
    await runServiceCheck(check);
    const updated = await prisma.serviceCheck.findUniqueOrThrow({
      where: { id: checkId },
      include: { server: { select: { name: true } } },
    });
    return NextResponse.json({
      check: { ...updated, server: undefined, serverName: updated.server?.name ?? null },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
