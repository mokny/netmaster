import { NextResponse } from "next/server";
import { handleApiError, ApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { loadStorageServer } from "@/lib/storage/route-helpers";
import { createVolumeGroup, removeVolumeGroup } from "@/lib/storage/disks";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { session, server } = await loadStorageServer(id, "EDITOR");
    const body = await req.json();
    const name = String(body.name ?? "");
    const devices = Array.isArray(body.devices) ? body.devices.map(String) : [];
    if (!name || devices.length === 0) throw new ApiError(400, "MISSING_REQUIRED_FIELDS");

    await createVolumeGroup(server, name, devices);
    await writeAuditLog(session, "storage.lvm.vgCreate", { serverId: id, detail: `${name} (${devices.join(", ")})` });
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

    await removeVolumeGroup(server, name);
    await writeAuditLog(session, "storage.lvm.vgRemove", { serverId: id, detail: name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
