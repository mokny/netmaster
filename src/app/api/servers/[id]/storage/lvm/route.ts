import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-helpers";
import { loadStorageServer } from "@/lib/storage/route-helpers";
import { listLvm } from "@/lib/storage/disks";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { server } = await loadStorageServer(id);
    const report = await listLvm(server);
    return NextResponse.json(report);
  } catch (err) {
    return handleApiError(err);
  }
}
