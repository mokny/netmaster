import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireNasSession, handleNasApiError, NasApiError } from "@/lib/nas-api-helpers";

export async function GET() {
  try {
    const session = await requireNasSession();
    const links = await prisma.nasShareLink.findMany({
      where: { createdByNasUserId: session.nasUserId },
      include: { share: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      links: links.map((l) => ({
        id: l.id,
        shareName: l.share.name,
        path: l.path,
        token: l.token,
        expiresAt: l.expiresAt,
        createdAt: l.createdAt,
      })),
    });
  } catch (err) {
    return handleNasApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireNasSession();
    const nasUser = await prisma.nasUser.findUniqueOrThrow({ where: { id: session.nasUserId } });
    if (!nasUser.canCreatePublicLinks) {
      throw new NasApiError(403, "PUBLIC_LINKS_NOT_ALLOWED");
    }

    const body = await req.json();
    const shareId = String(body.shareId ?? "");
    const path = String(body.path ?? "");
    if (!shareId || !path) throw new NasApiError(400, "INVALID_REQUEST");

    const membership = await prisma.nasShareMember.findUnique({
      where: { shareId_nasUserId: { shareId, nasUserId: session.nasUserId } },
    });
    if (!membership) throw new NasApiError(403, "FORBIDDEN_ROLE");

    const expiresAt =
      typeof body.expiresInDays === "number" && body.expiresInDays > 0
        ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
        : null;

    const link = await prisma.nasShareLink.create({
      data: {
        shareId,
        path,
        token: crypto.randomBytes(24).toString("base64url"),
        createdByNasUserId: session.nasUserId,
        expiresAt,
      },
    });

    return NextResponse.json({ link: { token: link.token } }, { status: 201 });
  } catch (err) {
    return handleNasApiError(err);
  }
}
