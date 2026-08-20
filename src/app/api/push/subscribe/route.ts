import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-helpers";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const endpoint = body?.endpoint;
    const p256dh = body?.keys?.p256dh;
    const auth = body?.keys?.auth;
    if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
      throw new ApiError(400, "Ungültige Subscription");
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId: session.userId,
        endpoint,
        p256dh,
        auth,
        userAgent: req.headers.get("user-agent") ?? "",
      },
      update: {
        userId: session.userId,
        p256dh,
        auth,
        userAgent: req.headers.get("user-agent") ?? "",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const endpoint = body?.endpoint;
    if (typeof endpoint !== "string") throw new ApiError(400, "endpoint fehlt");

    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: session.userId },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET() {
  try {
    const session = await requireSession();
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, endpoint: true, userAgent: true, createdAt: true },
    });
    return NextResponse.json({
      subscriptions: subscriptions.map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
