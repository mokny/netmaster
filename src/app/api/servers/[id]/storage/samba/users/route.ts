import { NextResponse } from "next/server";
import { handleApiError, ApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { loadStorageServer } from "@/lib/storage/route-helpers";
import { listSambaUsers, createOrUpdateSambaUser, removeSambaUser } from "@/lib/storage/samba";
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
    await writeAuditLog(session, "storage.samba.userRemove", { serverId: id, detail: username });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
