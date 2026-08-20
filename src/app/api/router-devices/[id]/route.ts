import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { requireRole, handleApiError } from "@/lib/api-helpers";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("ADMIN");
    const { id } = await params;
    const body = await req.json();

    const data: Record<string, unknown> = {};
    if (typeof body.name === "string") data.name = body.name;
    if (typeof body.hostname === "string") data.hostname = body.hostname;
    if (typeof body.username === "string") data.username = body.username;
    if (body.port !== undefined) data.port = Number(body.port);
    if (body.useTls !== undefined) data.useTls = Boolean(body.useTls);
    if (body.pollIntervalSec !== undefined) data.pollIntervalSec = Number(body.pollIntervalSec);
    if (typeof body.password === "string" && body.password.length > 0) {
      data.encryptedPassword = encryptSecret(body.password);
    }

    const device = await prisma.routerDevice.update({ where: { id }, data });
    return NextResponse.json({ device: { ...device, encryptedPassword: undefined } });
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
    await prisma.routerDevice.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
