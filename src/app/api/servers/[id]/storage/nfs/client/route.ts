import { NextResponse } from "next/server";
import { handleApiError, ApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { loadStorageServer } from "@/lib/storage/route-helpers";
import { listClientMounts, addClientMount, removeClientMount } from "@/lib/storage/nfs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { server } = await loadStorageServer(id);
    const mounts = await listClientMounts(server);
    return NextResponse.json({ mounts });
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
    const remote = String(body.remote ?? "");
    const mountpoint = String(body.mountpoint ?? "");
    const options = String(body.options ?? "");
    if (!remote || !mountpoint) throw new ApiError(400, "MISSING_REQUIRED_FIELDS");

    await addClientMount(server, remote, mountpoint, options);
    await writeAuditLog(session, "storage.nfs.clientMountAdd", {
      serverId: id,
      detail: `${remote} -> ${mountpoint}`,
    });
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
    const mountpoint = String(body.mountpoint ?? "");
    if (!mountpoint) throw new ApiError(400, "MISSING_REQUIRED_FIELDS");

    await removeClientMount(server, mountpoint);
    await writeAuditLog(session, "storage.nfs.clientMountRemove", { serverId: id, detail: mountpoint });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
