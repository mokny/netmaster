import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError, ApiError, requireProxmoxEnabled } from "@/lib/api-helpers";
import { execOnServer, buildSnapshotRollbackCommand } from "@/lib/ssh";
import { writeAuditLog } from "@/lib/audit";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; vmid: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { id, vmid } = await params;
    const vmidNum = Number(vmid);
    if (!Number.isInteger(vmidNum)) throw new ApiError(400, "INVALID_VM_ID");

    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) throw new ApiError(400, "SNAPSHOT_NAME_REQUIRED");

    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    requireProxmoxEnabled(server);
    const vm = await prisma.proxmoxVm.findUnique({
      where: { serverId_vmid: { serverId: id, vmid: vmidNum } },
    });
    if (!vm) throw new ApiError(404, "VM_NOT_FOUND");
    const type = vm.type === "QEMU" ? "qemu" : "lxc";

    let command: string;
    let stdin: string | undefined;
    try {
      ({ command, stdin } = buildSnapshotRollbackCommand(server, type, vmidNum, name));
    } catch (err) {
      throw new ApiError(400, "INVALID_INPUT", err instanceof Error ? err.message : undefined);
    }

    const result = await execOnServer(server, command, 5 * 60_000, stdin);
    if (result.code !== 0 && result.code !== null) {
      throw new ApiError(500, "ROLLBACK_FAILED", result.stderr.trim() || undefined);
    }

    await writeAuditLog(session, "vm.snapshot.rollback", {
      serverId: id,
      detail: `vmid=${vmidNum} name=${name}`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
