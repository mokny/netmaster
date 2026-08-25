import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError, ApiError } from "@/lib/api-helpers";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("ADMIN");
    const { id: shareId } = await params;
    const body = await req.json();
    const nasUserId = String(body.nasUserId ?? "");
    const role = body.role === "READ_ONLY" ? "READ_ONLY" : "READ_WRITE";
    if (!nasUserId) throw new ApiError(400, "NAS_USER_ID_REQUIRED");

    const member = await prisma.nasShareMember.upsert({
      where: { shareId_nasUserId: { shareId, nasUserId } },
      update: { role },
      create: { shareId, nasUserId, role },
      include: { nasUser: { select: { id: true, email: true, name: true } } },
    });

    return NextResponse.json({ member }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("ADMIN");
    const { id: shareId } = await params;
    const { searchParams } = new URL(req.url);
    const nasUserId = searchParams.get("nasUserId") ?? "";
    if (!nasUserId) throw new ApiError(400, "NAS_USER_ID_REQUIRED");

    await prisma.nasShareMember.delete({
      where: { shareId_nasUserId: { shareId, nasUserId } },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
