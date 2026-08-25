import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError, ApiError } from "@/lib/api-helpers";
import { getOrCreateNasGatewaySettings } from "@/lib/nas-gateway-settings";

export async function GET() {
  try {
    await requireRole("ADMIN");
    const settings = await getOrCreateNasGatewaySettings();
    return NextResponse.json({ settings });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    await requireRole("ADMIN");
    const body = await req.json();
    const current = await getOrCreateNasGatewaySettings();

    const publicHost =
      typeof body.publicHost === "string" ? body.publicHost.trim() : current.publicHost;
    const ftpEnabled = typeof body.ftpEnabled === "boolean" ? body.ftpEnabled : current.ftpEnabled;
    const ftpsEnabled = typeof body.ftpsEnabled === "boolean" ? body.ftpsEnabled : current.ftpsEnabled;
    const ftpPort = body.ftpPort !== undefined ? Number(body.ftpPort) : current.ftpPort;
    const ftpsPort = body.ftpsPort !== undefined ? Number(body.ftpsPort) : current.ftpsPort;
    const sftpPort = body.sftpPort !== undefined ? Number(body.sftpPort) : current.sftpPort;

    for (const port of [ftpPort, ftpsPort, sftpPort]) {
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new ApiError(400, "INVALID_NAS_PORT");
      }
    }

    const settings = await prisma.nasGatewaySettings.update({
      where: { id: current.id },
      data: { publicHost, ftpEnabled, ftpsEnabled, ftpPort, ftpsPort, sftpPort },
    });

    return NextResponse.json({ settings });
  } catch (err) {
    return handleApiError(err);
  }
}
