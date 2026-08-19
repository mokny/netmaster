import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-helpers";

export async function GET() {
  try {
    const session = await requireSession();
    const layout = await prisma.dashboardLayout.findUnique({
      where: { userId: session.userId },
    });
    return NextResponse.json({
      layout: layout ? JSON.parse(layout.layoutJson) : [],
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const layoutJson = JSON.stringify(body.layout ?? []);

    await prisma.dashboardLayout.upsert({
      where: { userId: session.userId },
      create: { userId: session.userId, layoutJson },
      update: { layoutJson },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
