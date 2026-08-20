import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireSession,
  requireRole,
  handleApiError,
  ApiError,
  requireProxmoxEnabled,
} from "@/lib/api-helpers";
import { execOnServer, buildSnapshotListCommand, buildSnapshotCreateCommand } from "@/lib/ssh";
import { parseSnapshotListOutput } from "@/lib/monitor/parse";
import { writeAuditLog } from "@/lib/audit";

async function loadVm(id: string, vmidNum: number) {
  if (!Number.isInteger(vmidNum)) throw new ApiError(400, "Ungültige VM-ID");
  const server = await prisma.server.findUniqueOrThrow({ where: { id } });
  requireProxmoxEnabled(server);
  const vm = await prisma.proxmoxVm.findUnique({
    where: { serverId_vmid: { serverId: id, vmid: vmidNum } },
  });
  if (!vm) throw new ApiError(404, "VM nicht gefunden");
  return { server, vm };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; vmid: string }> }
) {
  try {
    await requireSession();
    const { id, vmid } = await params;
    const { server, vm } = await loadVm(id, Number(vmid));

    const type = vm.type === "QEMU" ? "qemu" : "lxc";
    const command = buildSnapshotListCommand(type, vm.vmid);
    const result = await execOnServer(server, command, 15_000);
    const snapshots = parseSnapshotListOutput(result.stdout);

    return NextResponse.json({ snapshots });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; vmid: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { id, vmid } = await params;
    const { server, vm } = await loadVm(id, Number(vmid));

    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : undefined;
    const vmstate = body.vmstate === true;
    if (!name) throw new ApiError(400, "Name erforderlich");

    const type = vm.type === "QEMU" ? "qemu" : "lxc";
    let command: string;
    let stdin: string | undefined;
    try {
      ({ command, stdin } = buildSnapshotCreateCommand(server, type, vm.vmid, name, {
        description,
        vmstate,
      }));
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : "Ungültige Eingabe");
    }

    const result = await execOnServer(server, command, 5 * 60_000, stdin);
    if (result.code !== 0 && result.code !== null) {
      throw new ApiError(500, result.stderr.trim() || "Snapshot konnte nicht erstellt werden");
    }

    await writeAuditLog(session, "vm.snapshot.create", {
      serverId: id,
      detail: `vmid=${vm.vmid} name=${name}`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
