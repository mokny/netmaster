import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError } from "@/lib/api-helpers";
import { validateJobInput } from "@/lib/job-validation";

export async function GET() {
  try {
    await requireRole("EDITOR");
    const jobs = await prisma.job.findMany({ orderBy: { createdAt: "asc" } });
    return NextResponse.json({ jobs });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireRole("EDITOR");
    const body = await req.json();
    const input = validateJobInput(body);

    const job = await prisma.job.create({
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
    });

    return NextResponse.json({ job }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
