import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-helpers";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;

    const vms = await prisma.proxmoxVm.findMany({
      where: { serverId: id },
      orderBy: [{ type: "asc" }, { vmid: "asc" }],
    });

    return NextResponse.json({ vms });
  } catch (err) {
    return handleApiError(err);
  }
}
