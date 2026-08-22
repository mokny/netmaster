import { NextResponse } from "next/server";
import { handleApiError, ApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { loadStorageServer } from "@/lib/storage/route-helpers";
import { createPartition, deletePartition } from "@/lib/storage/disks";

const FS_HINTS = ["ext4", "xfs", "btrfs", "ntfs", "fat32"] as const;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { session, server } = await loadStorageServer(id, "EDITOR");
    const body = await req.json();
    const device = String(body.device ?? "");
    const fsHint = FS_HINTS.includes(body.fsHint) ? body.fsHint : "ext4";
    const start = Number(body.startPercent ?? 0);
    const end = Number(body.endPercent ?? 100);
    if (!device) throw new ApiError(400, "MISSING_REQUIRED_FIELDS");
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 100 || start >= end) {
      throw new ApiError(400, "INVALID_PARTITION_RANGE");
    }

    await createPartition(server, device, fsHint, start, end);
    await writeAuditLog(session, "storage.disk.partitionCreate", {
      serverId: id,
      detail: `${device} ${start}%-${end}% (${fsHint})`,
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
    const partitionNumber = Number(body.partitionNumber);
    if (!device || !partitionNumber) throw new ApiError(400, "MISSING_REQUIRED_FIELDS");

    await deletePartition(server, device, partitionNumber);
    await writeAuditLog(session, "storage.disk.partitionDelete", {
      serverId: id,
      detail: `${device}${partitionNumber}`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
