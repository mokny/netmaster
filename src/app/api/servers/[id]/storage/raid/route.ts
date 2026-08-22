import { NextResponse } from "next/server";
import { handleApiError, ApiError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { loadStorageServer } from "@/lib/storage/route-helpers";
import { getRaidStatus, createRaidArray, type RaidLevel } from "@/lib/storage/disks";

const LEVELS: RaidLevel[] = ["0", "1", "5", "6", "10"];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { server } = await loadStorageServer(id);
    const mdstat = await getRaidStatus(server);
    return NextResponse.json({ mdstat });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { session, server } = await loadStorageServer(id, "EDITOR");
    const body = await req.json();
    const mdDevice = String(body.mdDevice ?? "");
    const level = LEVELS.includes(body.level) ? (body.level as RaidLevel) : null;
    const devices = Array.isArray(body.devices) ? body.devices.map(String) : [];
    if (!mdDevice || !level || devices.length < 2) throw new ApiError(400, "MISSING_REQUIRED_FIELDS");

    await createRaidArray(server, mdDevice, level, devices);
    await writeAuditLog(session, "storage.raid.create", {
      serverId: id,
      detail: `${mdDevice} raid${level} (${devices.join(", ")})`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
