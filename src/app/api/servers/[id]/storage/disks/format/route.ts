import { NextResponse } from "next/server";
import { handleApiError, ApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { loadStorageServer } from "@/lib/storage/route-helpers";
import { formatDevice, type FormatFilesystem } from "@/lib/storage/disks";

const FILESYSTEMS: FormatFilesystem[] = ["ext4", "xfs", "btrfs", "ntfs", "exfat"];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { session, server } = await loadStorageServer(id, "EDITOR");
    const body = await req.json();
    const device = String(body.device ?? "");
    const fstype = body.fstype as FormatFilesystem;
    const label = String(body.label ?? "");
    if (!device || !FILESYSTEMS.includes(fstype)) throw new ApiError(400, "MISSING_REQUIRED_FIELDS");

    await formatDevice(server, device, fstype, label);
    await writeAuditLog(session, "storage.disk.format", { serverId: id, detail: `${device} -> ${fstype}` });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
