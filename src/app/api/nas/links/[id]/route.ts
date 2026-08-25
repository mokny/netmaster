import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireNasSession, handleNasApiError } from "@/lib/nas-api-helpers";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireNasSession();
    const { id } = await params;
    await prisma.nasShareLink.deleteMany({
      where: { id, createdByNasUserId: session.nasUserId },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleNasApiError(err);
  }
}
