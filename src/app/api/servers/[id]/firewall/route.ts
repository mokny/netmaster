import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireNetworkToolsEnabled, handleApiError } from "@/lib/api-helpers";
import { getFirewallState } from "@/lib/firewall";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;
    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    requireNetworkToolsEnabled(server);

    const state = await getFirewallState(server);
    return NextResponse.json(state);
  } catch (err) {
    return handleApiError(err);
  }
}
