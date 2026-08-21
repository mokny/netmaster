import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession, handleApiError, ApiError } from "@/lib/api-helpers";

// Listet globale Snippets (serverId=null) plus - wenn ?serverId= angegeben -
// die zusätzlich für diesen einen Server angelegten Snippets.
export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const serverId = req.nextUrl.searchParams.get("serverId");

    const snippets = await prisma.snippet.findMany({
      where: serverId ? { OR: [{ serverId: null }, { serverId }] } : {},
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      snippets: snippets.map((s) => ({ ...s, commands: JSON.parse(s.commandsJson) })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireRole("EDITOR");
    const body = await req.json();

    const name = String(body.name ?? "").trim();
    const commands: string[] = Array.isArray(body.commands)
      ? body.commands.map((c: unknown) => String(c).trim()).filter(Boolean)
      : [];
    const serverId = typeof body.serverId === "string" ? body.serverId : null;

    if (!name || commands.length === 0) {
      throw new ApiError(400, "Name und mindestens ein Befehl sind erforderlich");
    }

    const snippet = await prisma.snippet.create({
      data: { name, serverId, commandsJson: JSON.stringify(commands) },
    });

    return NextResponse.json(
      { snippet: { ...snippet, commands } },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
