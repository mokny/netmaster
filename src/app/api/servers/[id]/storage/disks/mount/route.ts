import { NextResponse } from "next/server";
import { handleApiError, ApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { loadStorageServer } from "@/lib/storage/route-helpers";
import { mountDevice, unmountDevice } from "@/lib/storage/disks";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { session, server } = await loadStorageServer(id, "EDITOR");
    const body = await req.json();
    const device = String(body.device ?? "");
    const mountpoint = String(body.mountpoint ?? "");
    const options = String(body.options ?? "defaults");
    if (!device || !mountpoint) throw new ApiError(400, "MISSING_REQUIRED_FIELDS");

    await mountDevice(server, device, mountpoint, options);
    await writeAuditLog(session, "storage.disk.mount", {
      serverId: id,
      detail: `${device} -> ${mountpoint}`,
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
    const device = String(body.device ?? "");
    const mountpoint = String(body.mountpoint ?? "");
    if (!device || !mountpoint) throw new ApiError(400, "MISSING_REQUIRED_FIELDS");

    await unmountDevice(server, device, mountpoint);
    await writeAuditLog(session, "storage.disk.unmount", {
      serverId: id,
      detail: `${device} <- ${mountpoint}`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
