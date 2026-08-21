import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { requireRole, handleApiError, ApiError } from "@/lib/api-helpers";
import { rebootDevice, reconnectWan, setWifiEnabled, type Tr064Config } from "@/lib/tr064";
import { collectRouterDevice } from "@/lib/monitor/router-collect";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await params;
    const body = await req.json();
    const action = String(body.action ?? "");

    const device = await prisma.routerDevice.findUnique({ where: { id } });
    if (!device) throw new ApiError(404, "ROUTER_DEVICE_NOT_FOUND");

    const config: Tr064Config = {
      hostname: device.hostname,
      port: device.port,
      useTls: device.useTls,
      username: device.username,
      password: decryptSecret(device.encryptedPassword),
    };

    switch (action) {
      case "reboot":
        await rebootDevice(config);
        break;
      case "reconnect":
        await reconnectWan(config);
        break;
      case "wifi-toggle": {
        const wifiIndex = Number(body.wifiIndex);
        const enabled = Boolean(body.enabled);
        if (!wifiIndex) throw new ApiError(400, "MISSING_WIFI_INDEX");
        await setWifiEnabled(config, wifiIndex, enabled);
        break;
      }
      default:
        throw new ApiError(400, "UNKNOWN_ACTION", action);
    }

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        userEmail: session.email,
        action: `router.${action}`,
        detail: device.name,
      },
    });

    // Status nach der Aktion zeitnah aktualisieren, statt auf den nächsten
    // Poll-Zyklus zu warten (Reboot/Reconnect brauchen aber ein paar
    // Sekunden, bis das Gerät wieder antwortet - daher verzögert).
    setTimeout(() => {
      void prisma.routerDevice
        .findUnique({ where: { id } })
        .then((d) => d && collectRouterDevice(d));
    }, action === "reboot" ? 20000 : 5000);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
