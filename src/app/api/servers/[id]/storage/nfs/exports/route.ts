import { NextResponse } from "next/server";
import { handleApiError, ApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { loadStorageServer } from "@/lib/storage/route-helpers";
import { listExports, addExport, removeExport } from "@/lib/storage/nfs";
import { openFirewallPorts } from "@/lib/storage/firewall-integration";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { server } = await loadStorageServer(id);
    const exports = await listExports(server);
    return NextResponse.json({ exports });
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
    const path = String(body.path ?? "");
    const client = String(body.client ?? "*");
    const options = String(body.options ?? "");
    if (!path) throw new ApiError(400, "MISSING_REQUIRED_FIELDS");

    await addExport(server, path, client, options);
    await openFirewallPorts(
      server,
      [
        { port: 2049, protocol: "tcp" },
        { port: 111, protocol: "tcp" },
        { port: 111, protocol: "udp" },
      ],
      "nfs"
    );
    await writeAuditLog(session, "storage.nfs.exportAdd", { serverId: id, detail: `${path} -> ${client}` });
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
    const path = String(body.path ?? "");
    const client = String(body.client ?? "");
    if (!path || !client) throw new ApiError(400, "MISSING_REQUIRED_FIELDS");

    await removeExport(server, path, client);
    await writeAuditLog(session, "storage.nfs.exportRemove", { serverId: id, detail: `${path} -> ${client}` });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
