import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError, ApiError } from "@/lib/api-helpers";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("EDITOR");
    const { id } = await params;
    const body = await req.json();

    const data: Record<string, unknown> = {};
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) throw new ApiError(400, "NAME_EMPTY");
      data.name = name;
    }
    if (Array.isArray(body.commands)) {
      const commands: string[] = body.commands
        .map((c: unknown) => String(c).trim())
        .filter(Boolean);
      if (commands.length === 0) throw new ApiError(400, "AT_LEAST_ONE_COMMAND_REQUIRED");
      data.commandsJson = JSON.stringify(commands);
    }
    if (body.serverId !== undefined) {
      data.serverId = typeof body.serverId === "string" ? body.serverId : null;
    }

    const snippet = await prisma.snippet.update({ where: { id }, data });
    return NextResponse.json({ snippet: { ...snippet, commands: JSON.parse(snippet.commandsJson) } });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("EDITOR");
    const { id } = await params;
    await prisma.snippet.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
