import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, ApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { loadStorageServer } from "@/lib/storage/route-helpers";
import { syncFilebrowserSshdUsers } from "@/lib/storage/samba";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await loadStorageServer(id);
    const webUsers = await prisma.sambaWebUser.findMany({ where: { serverId: id } });
    return NextResponse.json({ webUsers });
  } catch (err) {
    return handleApiError(err);
  }
}

// Upsert je (serverId, username) - der Samba-User selbst wird nicht hier
// angelegt (das macht .../samba/users), diese Route schaltet nur den
// separaten Web-Dateimanager-Zugriff frei/ab.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { session, server } = await loadStorageServer(id, "EDITOR");
    const body = await req.json();
    const username = String(body.username ?? "");
    const webUiEnabled = Boolean(body.webUiEnabled);
    const thumbnailsEnabled = Boolean(body.thumbnailsEnabled);
    if (!username) throw new ApiError(400, "MISSING_REQUIRED_FIELDS");

    const webUser = await prisma.sambaWebUser.upsert({
      where: { serverId_username: { serverId: server.id, username } },
      create: { serverId: server.id, username, webUiEnabled, thumbnailsEnabled },
      update: { webUiEnabled, thumbnailsEnabled },
    });

    // sshd braucht für jeden webUiEnabled-User ein erzwungenes internal-sftp
    // (siehe syncFilebrowserSshdUsers) - immer die komplette, aktuelle Liste
    // neu schreiben statt einzeln zu patchen, damit DB und sshd-Konfiguration
    // nie auseinanderlaufen.
    const enabledUsers = await prisma.sambaWebUser.findMany({
      where: { serverId: server.id, webUiEnabled: true },
      select: { username: true },
    });
    await syncFilebrowserSshdUsers(server, enabledUsers.map((u) => u.username));

    await writeAuditLog(session, "storage.samba.webUserSet", {
      serverId: id,
      detail: `${username} -> webUiEnabled=${webUiEnabled} thumbnailsEnabled=${thumbnailsEnabled}`,
    });
    return NextResponse.json({ webUser });
  } catch (err) {
    return handleApiError(err);
  }
}
