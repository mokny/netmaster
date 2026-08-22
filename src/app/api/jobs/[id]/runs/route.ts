import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError } from "@/lib/api-helpers";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("EDITOR");
    const { id } = await params;
    const runs = await prisma.jobRun.findMany({
      where: { jobId: id },
      orderBy: { startedAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ runs });
  } catch (err) {
    return handleApiError(err);
  }
}
