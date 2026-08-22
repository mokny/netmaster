import { NextResponse } from "next/server";
import { handleApiError, ApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { loadStorageServer } from "@/lib/storage/route-helpers";
import { getRaidDetail, growRaidArray, stopRaidArray } from "@/lib/storage/disks";

function toDevicePath(md: string): string {
  if (!/^[a-zA-Z0-9]+$/.test(md)) throw new ApiError(400, "INVALID_RAID_DEVICE");
  return md.startsWith("md") ? `/dev/${md}` : `/dev/md${md}`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; md: string }> }
) {
  try {
    const { id, md } = await params;
    const { server } = await loadStorageServer(id);
    const detail = await getRaidDetail(server, toDevicePath(md));
    return NextResponse.json({ detail });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; md: string }> }
) {
  try {
    const { id, md } = await params;
    const { session, server } = await loadStorageServer(id, "EDITOR");
    const body = await req.json();
    const addDevices = Array.isArray(body.addDevices) ? body.addDevices.map(String) : [];
    if (addDevices.length === 0) throw new ApiError(400, "MISSING_REQUIRED_FIELDS");

    const mdDevice = toDevicePath(md);
    await growRaidArray(server, mdDevice, addDevices);
    await writeAuditLog(session, "storage.raid.grow", {
      serverId: id,
      detail: `${mdDevice} +${addDevices.join(", ")}`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; md: string }> }
) {
  try {
    const { id, md } = await params;
    const { session, server } = await loadStorageServer(id, "EDITOR");
    const mdDevice = toDevicePath(md);

    await stopRaidArray(server, mdDevice);
    await writeAuditLog(session, "storage.raid.stop", { serverId: id, detail: mdDevice });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
