import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashNasPassword } from "@/lib/nas-auth";
import { pushNasPasswordToGateway } from "@/lib/nas-gateway-client";
import { requireRole, handleApiError, ApiError } from "@/lib/api-helpers";

const SELECT = {
  id: true,
  email: true,
  name: true,
  canCreatePublicLinks: true,
  mustChangePassword: true,
  totpEnabled: true,
  createdAt: true,
} as const;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("ADMIN");
    const { id } = await params;
    const body = await req.json();

    const data: {
      name?: string;
      canCreatePublicLinks?: boolean;
      passwordHash?: string;
      mustChangePassword?: boolean;
    } = {};

    if (typeof body.name === "string" && body.name.trim()) {
      data.name = body.name.trim();
    }
    if (typeof body.canCreatePublicLinks === "boolean") {
      data.canCreatePublicLinks = body.canCreatePublicLinks;
    }
    if (typeof body.password === "string" && body.password.length > 0) {
      if (body.password.length < 8) {
        throw new ApiError(400, "PASSWORD_TOO_SHORT");
      }
      data.passwordHash = await hashNasPassword(body.password);
      data.mustChangePassword = true;
    }

    const nasUser = await prisma.nasUser.update({ where: { id }, data, select: SELECT });
    if (typeof body.password === "string" && body.password.length > 0) {
      await pushNasPasswordToGateway(nasUser.email, body.password);
    }
    return NextResponse.json({ nasUser });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("ADMIN");
    const { id } = await params;
    await prisma.nasUser.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
