import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError, ApiError, requireProxmoxEnabled } from "@/lib/api-helpers";
import { execOnServer, buildBackupRestoreCommand } from "@/lib/ssh";
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
    const storage = typeof body.storage === "string" ? body.storage : "";
    const volid = typeof body.volid === "string" ? body.volid : "";
    const target = body.target === "new" ? "new" : "inplace";
    const newVmid = target === "new" ? Number(body.newVmid) : vmidNum;
    if (!storage || !volid) throw new ApiError(400, "STORAGE_AND_VOLID_REQUIRED");
    if (target === "new" && (!Number.isInteger(newVmid) || newVmid <= 0)) {
      throw new ApiError(400, "INVALID_TARGET_VM_ID");
    }

    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    requireProxmoxEnabled(server);

    // Restore-Ziel-VMID muss für "als neue VM" nicht existieren, für
    // In-Place muss die VM bereits vorhanden (und gestoppt) sein.
    let type: "qemu" | "lxc";
    if (target === "inplace") {
      const vm = await prisma.proxmoxVm.findUnique({
        where: { serverId_vmid: { serverId: id, vmid: vmidNum } },
      });
      if (!vm) throw new ApiError(404, "VM_NOT_FOUND");
      if (vm.status === "running") {
        throw new ApiError(400, "VM_MUST_BE_STOPPED_TO_RESTORE");
      }
      type = vm.type === "QEMU" ? "qemu" : "lxc";
    } else {
      type = volid.includes("vzdump-lxc-") ? "lxc" : "qemu";
      const existing = await prisma.proxmoxVm.findUnique({
        where: { serverId_vmid: { serverId: id, vmid: newVmid } },
      });
      if (existing) throw new ApiError(400, "VMID_ALREADY_IN_USE", String(newVmid));
    }

    let command: string;
    let stdin: string | undefined;
    try {
      ({ command, stdin } = buildBackupRestoreCommand(
        server,
        type,
        newVmid,
        storage,
        volid,
        target === "inplace"
      ));
    } catch (err) {
      throw new ApiError(400, "INVALID_INPUT", err instanceof Error ? err.message : undefined);
    }

    const result = await execOnServer(server, command, 30 * 60_000, stdin);
    if (result.code !== 0 && result.code !== null) {
      throw new ApiError(500, "RESTORE_FAILED", result.stderr.trim() || undefined);
    }

    await writeAuditLog(session, "vm.backup.restore", {
      serverId: id,
      detail: `vmid=${vmidNum} target=${target} newVmid=${newVmid} volid=${volid}`,
    });

    return NextResponse.json({ ok: true, vmid: newVmid });
  } catch (err) {
    return handleApiError(err);
  }
}
