import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInternalSecret } from "@/lib/nas-internal-auth";

// Vom Gateway-Mount-Manager nach jedem Mount-Versuch (Erfolg oder Fehler)
// aufgerufen, rein informativ fürs Admin-UI (kein Einfluss auf Quota/Auth).
export async function POST(req: Request) {
  const authError = requireInternalSecret(req);
  if (authError) return authError;

  const body = await req.json().catch(() => null);
  const shareId = typeof body?.shareId === "string" ? body.shareId : "";
  const active = Boolean(body?.active);
  const error = typeof body?.error === "string" ? body.error : null;
  if (!shareId) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  await prisma.nasShare.update({
    where: { id: shareId },
    data: {
      mountActive: active,
      mountError: active ? null : error,
      mountedAt: active ? new Date() : undefined,
    },
  });

  return NextResponse.json({ ok: true });
}
