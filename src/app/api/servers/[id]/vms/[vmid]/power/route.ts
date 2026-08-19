import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError, ApiError } from "@/lib/api-helpers";
import { execOnServer, buildVmPowerCommand, type VmPowerAction } from "@/lib/ssh";
import { writeAuditLog } from "@/lib/audit";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; vmid: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { id, vmid } = await params;
    const vmidNum = Number(vmid);
    if (!Number.isInteger(vmidNum)) throw new ApiError(400, "Ungültige VM-ID");

    const body = await req.json();
    if (body.action !== "start" && body.action !== "stop" && body.action !== "reboot") {
      throw new ApiError(400, "Ungültige Aktion");
    }
    const action: VmPowerAction = body.action;

    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    const vm = await prisma.proxmoxVm.findUnique({
      where: { serverId_vmid: { serverId: id, vmid: vmidNum } },
    });
    if (!vm) throw new ApiError(404, "VM nicht gefunden");

    let command: string;
    let stdin: string | undefined;
    try {
      ({ command, stdin } = buildVmPowerCommand(
        server,
        vm.type === "QEMU" ? "qemu" : "lxc",
        vmidNum,
        action
      ));
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : "Ungültige Konfiguration");
    }

    const result = await execOnServer(server, command, 20_000, stdin);
    if (result.code !== 0 && result.code !== null) {
      throw new ApiError(500, result.stderr.trim() || `${action} fehlgeschlagen`);
    }

    await writeAuditLog(session, `vm.${action}`, {
      serverId: id,
      detail: `vmid=${vmidNum} name=${vm.name}`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
