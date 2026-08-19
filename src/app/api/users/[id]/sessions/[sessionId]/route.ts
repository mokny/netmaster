import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError, ApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const session = await requireRole("ADMIN");
    const { id, sessionId } = await params;

    const target = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!target || target.userId !== id) {
      throw new ApiError(404, "Session nicht gefunden");
    }

    await prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
    await writeAuditLog(session, "user.session_revoke", { detail: `userId=${id}` });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
