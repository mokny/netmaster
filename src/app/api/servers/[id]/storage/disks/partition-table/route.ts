import { NextResponse } from "next/server";
import { handleApiError, ApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { loadStorageServer } from "@/lib/storage/route-helpers";
import { createPartitionTable } from "@/lib/storage/disks";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { session, server } = await loadStorageServer(id, "EDITOR");
    const body = await req.json();
    const device = String(body.device ?? "");
    const label = body.label === "msdos" ? "msdos" : "gpt";
    if (!device) throw new ApiError(400, "MISSING_REQUIRED_FIELDS");

    await createPartitionTable(server, device, label);
    await writeAuditLog(session, "storage.disk.partitionTable", { serverId: id, detail: `${device} (${label})` });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
