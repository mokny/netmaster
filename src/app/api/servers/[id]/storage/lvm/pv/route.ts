import { NextResponse } from "next/server";
import { handleApiError, ApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { loadStorageServer } from "@/lib/storage/route-helpers";
import { createPhysicalVolume, removePhysicalVolume } from "@/lib/storage/disks";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { session, server } = await loadStorageServer(id, "EDITOR");
    const body = await req.json();
    const device = String(body.device ?? "");
    if (!device) throw new ApiError(400, "MISSING_REQUIRED_FIELDS");

    await createPhysicalVolume(server, device);
    await writeAuditLog(session, "storage.lvm.pvCreate", { serverId: id, detail: device });
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
    if (!device) throw new ApiError(400, "MISSING_REQUIRED_FIELDS");

    await removePhysicalVolume(server, device);
    await writeAuditLog(session, "storage.lvm.pvRemove", { serverId: id, detail: device });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
