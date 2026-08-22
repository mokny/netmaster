import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError, ApiError } from "@/lib/api-helpers";
import {
  parseCrontab,
  addCronEntry,
  updateCronEntry,
  deleteCronEntry,
  readCrontab,
  writeCrontab,
  isValidCronSchedule,
} from "@/lib/native-cron";

const CRON_ERROR_CODES = new Set([
  "INVALID_CRON_USER",
  "SUDO_PASSWORD_REQUIRED",
  "CRONTAB_READ_FAILED",
  "CRONTAB_WRITE_FAILED",
  "CRON_ENTRY_NOT_FOUND",
]);

function toApiError(err: unknown): never {
  if (err instanceof Error && CRON_ERROR_CODES.has(err.message)) {
    throw new ApiError(400, err.message);
  }
  throw err;
}

async function getServerOrThrow(serverId: string) {
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) throw new ApiError(404, "SERVER_NOT_FOUND");
  return server;
}

function targetUserFrom(url: URL, defaultUser: string): string {
  return url.searchParams.get("user")?.trim() || defaultUser;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    await requireRole("EDITOR");
    const { serverId } = await params;
    const server = await getServerOrThrow(serverId);
    const user = targetUserFrom(new URL(req.url), server.sshUsername);

    const text = await readCrontab(server, user).catch(toApiError);
    return NextResponse.json({ entries: parseCrontab(text), user });
  } catch (err) {
    return handleApiError(err);
  }
}

interface EntryBody {
  user?: string;
  schedule: string;
  command: string;
  comment?: string;
}

function validateEntryBody(body: Record<string, unknown>): EntryBody {
  const schedule = String(body.schedule ?? "").trim();
  const command = String(body.command ?? "").trim();
  if (!isValidCronSchedule(schedule)) throw new ApiError(400, "INVALID_CRON_EXPRESSION");
  if (!command) throw new ApiError(400, "JOB_COMMAND_REQUIRED");
  return {
    user: typeof body.user === "string" ? body.user : undefined,
    schedule,
    command,
    comment: typeof body.comment === "string" ? body.comment.trim() : "",
  };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    await requireRole("EDITOR");
    const { serverId } = await params;
    const server = await getServerOrThrow(serverId);
    const body = validateEntryBody(await req.json());
    const user = body.user?.trim() || server.sshUsername;

    const current = await readCrontab(server, user).catch(toApiError);
    const updated = addCronEntry(current, {
      schedule: body.schedule,
      command: body.command,
      comment: body.comment ?? "",
    });
    await writeCrontab(server, user, updated).catch(toApiError);

    return NextResponse.json({ entries: parseCrontab(updated), user }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

interface MutationBody extends EntryBody {
  target: { id: string | null; raw: string };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    await requireRole("EDITOR");
    const { serverId } = await params;
    const server = await getServerOrThrow(serverId);
    const raw = await req.json();
    const body = validateEntryBody(raw) as MutationBody;
    body.target = raw.target;
    if (!body.target || (body.target.id === undefined && body.target.raw === undefined)) {
      throw new ApiError(400, "MISSING_REQUIRED_FIELDS");
    }
    const user = body.user?.trim() || server.sshUsername;

    const current = await readCrontab(server, user).catch(toApiError);
    let updated: string;
    try {
      updated = updateCronEntry(
        current,
        { id: body.target.id ?? null, raw: body.target.raw ?? "" },
        { schedule: body.schedule, command: body.command, comment: body.comment ?? "" }
      );
    } catch (err) {
      toApiError(err);
    }
    await writeCrontab(server, user, updated).catch(toApiError);

    return NextResponse.json({ entries: parseCrontab(updated), user });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    await requireRole("EDITOR");
    const { serverId } = await params;
    const server = await getServerOrThrow(serverId);
    const body = await req.json();
    const target = body.target as { id: string | null; raw: string } | undefined;
    if (!target) throw new ApiError(400, "MISSING_REQUIRED_FIELDS");
    const user = typeof body.user === "string" && body.user.trim() ? body.user.trim() : server.sshUsername;

    const current = await readCrontab(server, user).catch(toApiError);
    let updated: string;
    try {
      updated = deleteCronEntry(current, { id: target.id ?? null, raw: target.raw ?? "" });
    } catch (err) {
      toApiError(err);
    }
    await writeCrontab(server, user, updated).catch(toApiError);

    return NextResponse.json({ entries: parseCrontab(updated), user });
  } catch (err) {
    return handleApiError(err);
  }
}
