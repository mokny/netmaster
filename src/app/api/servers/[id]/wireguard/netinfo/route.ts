import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireWireguardEnabled, handleApiError } from "@/lib/api-helpers";
import { detectDefaultRouteInterface, listNetworkInterfaces } from "@/lib/wireguard";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;
    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    requireWireguardEnabled(server);

    const [defaultIface, interfaces] = await Promise.all([
      detectDefaultRouteInterface(server),
      listNetworkInterfaces(server),
    ]);

    return NextResponse.json({ defaultIface, interfaces });
  } catch (err) {
    return handleApiError(err);
  }
}
