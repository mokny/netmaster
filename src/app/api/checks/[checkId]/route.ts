import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError } from "@/lib/api-helpers";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ checkId: string }> }
) {
  try {
    await requireRole("EDITOR");
    const { checkId } = await params;
    const body = await req.json();

    const data: Record<string, unknown> = {};
    if (typeof body.name === "string") data.name = body.name;
    if (typeof body.url === "string") data.url = body.url;
    for (const f of ["expectedStatus", "intervalSec", "timeoutMs"]) {
      if (body[f] !== undefined) data[f] = Number(body[f]);
    }

    const check = await prisma.serviceCheck.update({ where: { id: checkId }, data });
    return NextResponse.json({ check });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ checkId: string }> }
) {
  try {
    await requireRole("EDITOR");
    const { checkId } = await params;
    await prisma.serviceCheck.delete({ where: { id: checkId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
