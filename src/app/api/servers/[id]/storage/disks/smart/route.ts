import { NextResponse } from "next/server";
import { handleApiError, ApiError } from "@/lib/api-helpers";
import { loadStorageServer } from "@/lib/storage/route-helpers";
import { getSmartInfo } from "@/lib/storage/disks";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { server } = await loadStorageServer(id);
    const device = new URL(req.url).searchParams.get("device");
    if (!device) throw new ApiError(400, "MISSING_DEVICE");
    const info = await getSmartInfo(server, device);
    return NextResponse.json(info);
  } catch (err) {
    return handleApiError(err);
  }
}
