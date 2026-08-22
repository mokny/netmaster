import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError, ApiError } from "@/lib/api-helpers";
import { triggerJobManually } from "@/lib/jobs/scheduler";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("EDITOR");
    const { id } = await params;
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) throw new ApiError(404, "JOB_NOT_FOUND");

    const run = await triggerJobManually(job).catch((err) => {
      if (err instanceof Error && err.message === "JOB_ALREADY_RUNNING") {
        throw new ApiError(409, "JOB_ALREADY_RUNNING");
      }
      throw err;
    });

    return NextResponse.json({ run });
  } catch (err) {
    return handleApiError(err);
  }
}
