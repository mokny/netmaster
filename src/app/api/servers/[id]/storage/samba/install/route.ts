import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { loadStorageServer } from "@/lib/storage/route-helpers";
import { isSambaInstalled, installSamba, uninstallSamba } from "@/lib/storage/samba";
import { openFirewallPorts } from "@/lib/storage/firewall-integration";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { server } = await loadStorageServer(id);
    const installed = await isSambaInstalled(server);
    return NextResponse.json({ installed });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { session, server } = await loadStorageServer(id, "EDITOR");

    await installSamba(server);
    await openFirewallPorts(
      server,
      [
        { port: 445, protocol: "tcp" },
        { port: 139, protocol: "tcp" },
      ],
      "samba"
    );
    await writeAuditLog(session, "storage.samba.install", { serverId: id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { session, server } = await loadStorageServer(id, "EDITOR");

    await uninstallSamba(server);
    await writeAuditLog(session, "storage.samba.uninstall", { serverId: id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
