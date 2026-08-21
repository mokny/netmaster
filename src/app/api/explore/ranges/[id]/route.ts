import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError, ApiError } from "@/lib/api-helpers";

const CIDR_PATTERN = /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("EDITOR");
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.exploreRange.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Range nicht gefunden");

    const data: { enabled?: boolean; cidr?: string } = {};
    if (body.enabled !== undefined) data.enabled = Boolean(body.enabled);
    if (body.cidr !== undefined) {
      if (existing.source !== "MANUAL") {
        throw new ApiError(400, "Automatisch erkannte Ranges können nur aktiviert/deaktiviert werden");
      }
      const cidr = String(body.cidr).trim();
      if (!CIDR_PATTERN.test(cidr)) {
        throw new ApiError(400, "Range muss im CIDR-Format vorliegen (z.B. 192.168.1.0/24)");
      }
      data.cidr = cidr;
    }

    const range = await prisma.exploreRange.update({ where: { id }, data });
    return NextResponse.json({ range });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("EDITOR");
    const { id } = await params;

    const existing = await prisma.exploreRange.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Range nicht gefunden");
    if (existing.source !== "MANUAL") {
      throw new ApiError(
        400,
        "Automatisch erkannte Ranges können nicht gelöscht werden, nur deaktiviert"
      );
    }

    await prisma.exploreRange.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return handleApiError(err);
  }
}
