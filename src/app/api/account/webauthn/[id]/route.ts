import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

async function loadOwnedCredential(userId: string, id: string) {
  const credential = await prisma.webAuthnCredential.findUnique({ where: { id } });
  if (!credential || credential.userId !== userId) {
    throw new ApiError(404, "Passkey nicht gefunden");
  }
  return credential;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    await loadOwnedCredential(session.userId, id);

    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
    if (!name) throw new ApiError(400, "Name erforderlich");

    await prisma.webAuthnCredential.update({ where: { id }, data: { name } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const credential = await loadOwnedCredential(session.userId, id);

    await prisma.$transaction([
      prisma.webAuthnCredential.delete({ where: { id } }),
      prisma.session.updateMany({
        where: { userId: session.userId, id: { not: session.sessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await writeAuditLog(session, "account.passkey_removed", {
      detail: `${credential.name}, andere Sessions beendet`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
