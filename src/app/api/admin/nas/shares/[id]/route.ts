import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError } from "@/lib/api-helpers";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("ADMIN");
    const { id } = await params;
    const body = await req.json();

    const data: {
      name?: string;
      quotaBytes?: bigint | null;
      readOnlyLocked?: boolean;
    } = {};

    if (typeof body.name === "string" && body.name.trim()) {
      data.name = body.name.trim();
    }
    if (body.quotaBytes === null) {
      data.quotaBytes = null;
    } else if (typeof body.quotaBytes === "number" && body.quotaBytes > 0) {
      data.quotaBytes = BigInt(Math.floor(body.quotaBytes));
    }
    // Admin kann eine wegen Quota gesperrte Freigabe manuell wieder freigeben
    // (z.B. nachdem Platz geschaffen wurde, bevor der nächste Quota-Check
    // vom Gateway läuft).
    if (body.readOnlyLocked === false) {
      data.readOnlyLocked = false;
    }

    const share = await prisma.nasShare.update({ where: { id }, data });
    return NextResponse.json({
      share: { ...share, quotaBytes: share.quotaBytes?.toString() ?? null, usedBytes: share.usedBytes.toString() },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("ADMIN");
    const { id } = await params;
    await prisma.nasShare.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
