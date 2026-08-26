import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, ApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { loadStorageServer } from "@/lib/storage/route-helpers";
import {
  listSambaUsers,
  createOrUpdateSambaUser,
  removeSambaUser,
  syncFilebrowserSshdUsers,
} from "@/lib/storage/samba";
import { openFirewallPorts } from "@/lib/storage/firewall-integration";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { server } = await loadStorageServer(id);
    const users = await listSambaUsers(server);
    return NextResponse.json({ users });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { session, server } = await loadStorageServer(id, "EDITOR");
    const body = await req.json();
    const username = String(body.username ?? "");
    const password = String(body.password ?? "");
    if (!username || !password) throw new ApiError(400, "MISSING_REQUIRED_FIELDS");

    await createOrUpdateSambaUser(server, username, password);
    await openFirewallPorts(
      server,
      [
        { port: 445, protocol: "tcp" },
        { port: 139, protocol: "tcp" },
      ],
      "samba"
    );
    await writeAuditLog(session, "storage.samba.userSet", { serverId: id, detail: username });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { session, server } = await loadStorageServer(id, "EDITOR");
    const body = await req.json();
    const username = String(body.username ?? "");
    const removeSystemUser = Boolean(body.removeSystemUser);
    if (!username) throw new ApiError(400, "MISSING_REQUIRED_FIELDS");

    await removeSambaUser(server, username, removeSystemUser);

    // Web-Dateimanager-Freigabe (falls gesetzt) fällt mit dem Samba-User weg -
    // sonst bliebe ein verwaister sshd Match-User-Eintrag (ForceCommand
    // internal-sftp) für einen nicht mehr existierenden/nicht mehr als
    // Samba-User genutzten Account bestehen.
    await prisma.sambaWebUser.deleteMany({ where: { serverId: id, username } });
    const enabledUsers = await prisma.sambaWebUser.findMany({
      where: { serverId: id, webUiEnabled: true },
      select: { username: true },
    });
    await syncFilebrowserSshdUsers(server, enabledUsers.map((u) => u.username));

    await writeAuditLog(session, "storage.samba.userRemove", { serverId: id, detail: username });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
