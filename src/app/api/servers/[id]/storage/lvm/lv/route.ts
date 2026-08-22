import { NextResponse } from "next/server";
import { handleApiError, ApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { loadStorageServer } from "@/lib/storage/route-helpers";
import { createLogicalVolume, extendLogicalVolume, removeLogicalVolume } from "@/lib/storage/disks";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { session, server } = await loadStorageServer(id, "EDITOR");
    const body = await req.json();
    const vg = String(body.vg ?? "");
    const lv = String(body.lv ?? "");
    const size = String(body.size ?? "");
    if (!vg || !lv || !size) throw new ApiError(400, "MISSING_REQUIRED_FIELDS");

    await createLogicalVolume(server, vg, lv, size);
    await writeAuditLog(session, "storage.lvm.lvCreate", { serverId: id, detail: `${vg}/${lv} (${size})` });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { session, server } = await loadStorageServer(id, "EDITOR");
    const body = await req.json();
    const vg = String(body.vg ?? "");
    const lv = String(body.lv ?? "");
    const addSize = String(body.addSize ?? "");
    const fstype = body.fstype === "xfs" || body.fstype === "btrfs" ? body.fstype : "ext4";
    if (!vg || !lv || !addSize) throw new ApiError(400, "MISSING_REQUIRED_FIELDS");

    await extendLogicalVolume(server, vg, lv, addSize, fstype);
    await writeAuditLog(session, "storage.lvm.lvExtend", { serverId: id, detail: `${vg}/${lv} +${addSize}` });
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
    const vg = String(body.vg ?? "");
    const lv = String(body.lv ?? "");
    if (!vg || !lv) throw new ApiError(400, "MISSING_REQUIRED_FIELDS");

    await removeLogicalVolume(server, vg, lv);
    await writeAuditLog(session, "storage.lvm.lvRemove", { serverId: id, detail: `${vg}/${lv}` });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
