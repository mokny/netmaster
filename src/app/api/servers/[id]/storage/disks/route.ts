import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-helpers";
import { loadStorageServer } from "@/lib/storage/route-helpers";
import { listBlockDevices } from "@/lib/storage/disks";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { server } = await loadStorageServer(id);
    const devices = await listBlockDevices(server);
    return NextResponse.json({ devices });
  } catch (err) {
    return handleApiError(err);
  }
}
