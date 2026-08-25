import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireNasSession, handleNasApiError } from "@/lib/nas-api-helpers";

// Freigaben, auf die der eingeloggte NAS-User Zugriff hat (Web-Dateibrowser
// und Dashboard-Übersicht) - Zugriff über die Gateway-Datei-API läuft
// separat pro Freigabe (siehe /api/nas/files/[shareId]).
export async function GET() {
  try {
    const session = await requireNasSession();
    const memberships = await prisma.nasShareMember.findMany({
      where: { nasUserId: session.nasUserId },
      include: { share: true },
    });

    return NextResponse.json({
      shares: memberships.map((m) => ({
        id: m.share.id,
        name: m.share.name,
        role: m.role,
        quotaBytes: m.share.quotaBytes?.toString() ?? null,
        usedBytes: m.share.usedBytes.toString(),
        readOnlyLocked: m.share.readOnlyLocked,
        mountActive: m.share.mountActive,
      })),
    });
  } catch (err) {
    return handleNasApiError(err);
  }
}
