import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import {
  getDeviceInfo,
  getWanStatus,
  getConnectedHosts,
  getWifiNetworks,
  type Tr064Config,
} from "@/lib/tr064";
import { publish } from "./events";
import type { RouterDevice } from "@/generated/prisma/client";

function toConfig(device: RouterDevice): Tr064Config {
  return {
    hostname: device.hostname,
    port: device.port,
    useTls: device.useTls,
    username: device.username,
    password: decryptSecret(device.encryptedPassword),
  };
}

export async function collectRouterDevice(device: RouterDevice) {
  const config = toConfig(device);

  try {
    const [info, hosts, wifi] = await Promise.all([
      getDeviceInfo(config),
      getConnectedHosts(config).catch(() => []),
      getWifiNetworks(config).catch(() => []),
    ]);

    // WAN-Status nur, wenn das Gerät den Service anbietet (Repeater i.d.R. nicht).
    let wanConnectionStatus: string | null = null;
    let wanExternalIp: string | null = null;
    try {
      const wan = await getWanStatus(config);
      wanConnectionStatus = wan.connectionStatus;
      wanExternalIp = wan.externalIp;
    } catch {
      // kein WAN-Service auf diesem Gerät - erwartet bei Repeatern.
    }

    await prisma.routerDevice.update({
      where: { id: device.id },
      data: {
        lastStatus: "OK",
        lastError: null,
        lastCheckedAt: new Date(),
        modelName: info.modelName,
        firmwareVersion: info.firmwareVersion,
        uptimeSec: info.uptimeSec,
        wanConnectionStatus,
        wanExternalIp,
        connectedHostsJson: JSON.stringify(hosts),
        wifiNetworksJson: JSON.stringify(wifi),
      },
    });

    publish({ type: "router-device", routerDeviceId: device.id, status: "OK" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    await prisma.routerDevice.update({
      where: { id: device.id },
      data: { lastStatus: "CRITICAL", lastError: message, lastCheckedAt: new Date() },
    });
    publish({ type: "router-device", routerDeviceId: device.id, status: "CRITICAL" });
  }
}
