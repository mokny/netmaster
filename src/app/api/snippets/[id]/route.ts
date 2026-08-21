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
      if (!name) throw new ApiError(400, "Name darf nicht leer sein");
      data.name = name;
    }
    if (Array.isArray(body.commands)) {
      const commands: string[] = body.commands
        .map((c: unknown) => String(c).trim())
        .filter(Boolean);
      if (commands.length === 0) throw new ApiError(400, "Mindestens ein Befehl ist erforderlich");
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
