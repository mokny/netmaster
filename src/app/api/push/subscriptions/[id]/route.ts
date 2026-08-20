import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-helpers";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const sub = await prisma.pushSubscription.findUnique({ where: { id } });
    if (!sub || sub.userId !== session.userId) {
      throw new ApiError(404, "Subscription nicht gefunden");
    }

    await prisma.pushSubscription.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
