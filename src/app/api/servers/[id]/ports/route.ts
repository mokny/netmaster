import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireNetworkToolsEnabled, handleApiError } from "@/lib/api-helpers";
import { buildRootScriptCommand } from "@/lib/ssh";
import { execPooled } from "@/lib/ssh-pool";
import { PORTS_COMMAND, parsePortsOutput } from "@/lib/ports";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;
    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    requireNetworkToolsEnabled(server);

    const { command, stdin } = buildRootScriptCommand(server, PORTS_COMMAND);
    const res = await execPooled(server, command, 15_000, stdin);
    const snapshot = parsePortsOutput(res.stdout);

    return NextResponse.json(snapshot);
  } catch (err) {
    return handleApiError(err);
  }
}
