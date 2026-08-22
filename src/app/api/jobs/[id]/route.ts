import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError, ApiError } from "@/lib/api-helpers";
import { validateJobInput } from "@/lib/job-validation";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("EDITOR");
    const { id } = await params;
    const body = await req.json();
    const input = validateJobInput(body);

    const job = await prisma.job
      .update({
        where: { id },
        data: {
          name: input.name,
          enabled: input.enabled,
          kind: input.kind,
          predefinedAction: input.predefinedAction,
          command: input.command,
          targetServerIdsJson: JSON.stringify(input.targetServerIds),
          scheduleType: input.scheduleType,
          intervalSec: input.intervalSec,
          cronExpression: input.cronExpression,
          timeoutSec: input.timeoutSec,
        },
      })
      .catch(() => {
        throw new ApiError(404, "JOB_NOT_FOUND");
      });

    return NextResponse.json({ job });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("EDITOR");
    const { id } = await params;
    await prisma.job.delete({ where: { id } }).catch(() => {
      throw new ApiError(404, "JOB_NOT_FOUND");
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
