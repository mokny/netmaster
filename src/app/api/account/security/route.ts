import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-helpers";

export async function GET() {
  try {
    const session = await requireSession();

    const [user, passkeys] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: session.userId },
        select: { totpEnabled: true },
      }),
      prisma.webAuthnCredential.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, createdAt: true, lastUsedAt: true },
      }),
    ]);

    return NextResponse.json({
      totpEnabled: user.totpEnabled,
      passkeys: passkeys.map((p) => ({
        id: p.id,
        name: p.name,
        createdAt: p.createdAt.toISOString(),
        lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
