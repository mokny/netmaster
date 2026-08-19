import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-helpers";
import { revokeCurrentSession } from "@/lib/auth";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const target = await prisma.session.findUnique({ where: { id } });
    if (!target || target.userId !== session.userId) {
      throw new ApiError(404, "Session nicht gefunden");
    }

    if (id === session.sessionId) {
      // Eigene aktuelle Session beenden = Logout.
      await revokeCurrentSession();
    } else {
      await prisma.session.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
