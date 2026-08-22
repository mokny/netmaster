import { NextResponse } from "next/server";
import { handleApiError, ApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { loadStorageServer } from "@/lib/storage/route-helpers";
import { listShares, upsertShare, removeShare, type SambaShare } from "@/lib/storage/samba";
import { openFirewallPorts } from "@/lib/storage/firewall-integration";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { server } = await loadStorageServer(id);
    const shares = await listShares(server);
    return NextResponse.json({ shares });
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
    const share: SambaShare = {
      name: String(body.name ?? ""),
      path: String(body.path ?? ""),
      guestOk: Boolean(body.guestOk),
      readUsers: Array.isArray(body.readUsers) ? body.readUsers.map(String) : [],
      writeUsers: Array.isArray(body.writeUsers) ? body.writeUsers.map(String) : [],
    };
    if (!share.name || !share.path) throw new ApiError(400, "MISSING_REQUIRED_FIELDS");

    await upsertShare(server, share);
    await openFirewallPorts(
      server,
      [
        { port: 445, protocol: "tcp" },
        { port: 139, protocol: "tcp" },
      ],
      "samba"
    );
    await writeAuditLog(session, "storage.samba.shareSet", { serverId: id, detail: `${share.name} -> ${share.path}` });
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
    const name = String(body.name ?? "");
    if (!name) throw new ApiError(400, "MISSING_REQUIRED_FIELDS");

    await removeShare(server, name);
    await writeAuditLog(session, "storage.samba.shareRemove", { serverId: id, detail: name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
