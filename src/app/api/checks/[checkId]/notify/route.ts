import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-helpers";

const DEFAULTS = {
  downEnabled: false,
  downDelayMin: 0,
  downRecoveryEnabled: false,
  slowEnabled: false,
  slowDelayMin: 0,
  slowRecoveryEnabled: false,
};

// Gibt die Benachrichtigungs-Konfiguration des eingeloggten Users für einen
// einzelnen Check zurück (Defaults, falls noch kein Abo existiert).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ checkId: string }> }
) {
  try {
    const session = await requireSession();
    const { checkId } = await params;
    const sub = await prisma.serviceCheckSubscriber.findUnique({
      where: { serviceCheckId_userId: { serviceCheckId: checkId, userId: session.userId } },
    });
    return NextResponse.json({ pref: sub ? { ...DEFAULTS, ...sub } : DEFAULTS });
  } catch (err) {
    return handleApiError(err);
  }
}

// Legt die Konfiguration des eingeloggten Users für einen Check an oder
// aktualisiert sie - unabhängig von den Einstellungen anderer Abonnenten.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ checkId: string }> }
) {
  try {
    const session = await requireSession();
    const { checkId } = await params;
    const body = await req.json();

    const data = {
      downEnabled: Boolean(body.downEnabled),
      downDelayMin: Math.max(0, Number(body.downDelayMin ?? 0)),
      downRecoveryEnabled: Boolean(body.downRecoveryEnabled),
      slowEnabled: Boolean(body.slowEnabled),
      slowDelayMin: Math.max(0, Number(body.slowDelayMin ?? 0)),
      slowRecoveryEnabled: Boolean(body.slowRecoveryEnabled),
    };

    await prisma.serviceCheckSubscriber.upsert({
      where: { serviceCheckId_userId: { serviceCheckId: checkId, userId: session.userId } },
      create: { serviceCheckId: checkId, userId: session.userId, ...data },
      update: data,
    });

    if (typeof body.latencyWarnMs !== "undefined") {
      const latencyWarnMs =
        body.latencyWarnMs === null || body.latencyWarnMs === "" ? null : Number(body.latencyWarnMs);
      await prisma.serviceCheck.update({ where: { id: checkId }, data: { latencyWarnMs } });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
