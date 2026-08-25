import { NextResponse } from "next/server";
import { requireNasSession, handleNasApiError } from "@/lib/nas-api-helpers";
import { getOrCreateNasGatewaySettings } from "@/lib/nas-gateway-settings";

// Nur die für den Verbindungstext nötigen, unkritischen Felder - kein
// Admin-Only-Endpoint, da jeder eingeloggte NAS-User seinen eigenen
// Verbindungstext sehen darf (siehe /nas/account).
export async function GET() {
  try {
    await requireNasSession();
    const settings = await getOrCreateNasGatewaySettings();
    return NextResponse.json({
      settings: {
        publicHost: settings.publicHost,
        ftpEnabled: settings.ftpEnabled,
        ftpPort: settings.ftpPort,
        ftpsEnabled: settings.ftpsEnabled,
        ftpsPort: settings.ftpsPort,
        sftpPort: settings.sftpPort,
      },
    });
  } catch (err) {
    return handleNasApiError(err);
  }
}
