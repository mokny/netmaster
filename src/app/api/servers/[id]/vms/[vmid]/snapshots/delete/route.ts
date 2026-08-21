import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError, ApiError, requireProxmoxEnabled } from "@/lib/api-helpers";
import { execOnServer, buildSnapshotDeleteCommand } from "@/lib/ssh";
import { writeAuditLog } from "@/lib/audit";

interface BatchResult {
  ok: string[];
  failed: { name: string; error: string }[];
}

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
    const names: string[] = Array.isArray(body.names)
      ? body.names.filter((n: unknown) => typeof n === "string")
      : [];
    if (names.length === 0) throw new ApiError(400, "NO_SNAPSHOTS_SELECTED");

    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    requireProxmoxEnabled(server);
    const vm = await prisma.proxmoxVm.findUnique({
      where: { serverId_vmid: { serverId: id, vmid: vmidNum } },
    });
    if (!vm) throw new ApiError(404, "VM_NOT_FOUND");
    const type = vm.type === "QEMU" ? "qemu" : "lxc";

    const results: BatchResult = { ok: [], failed: [] };
    for (const name of names) {
      try {
        const { command, stdin } = buildSnapshotDeleteCommand(server, type, vmidNum, name);
        const result = await execOnServer(server, command, 60_000, stdin);
        if (result.code !== 0 && result.code !== null) {
          results.failed.push({ name, error: result.stderr.trim() || "DELETE_FAILED" });
        } else {
          results.ok.push(name);
        }
      } catch (err) {
        results.failed.push({
          name,
          error: err instanceof Error ? err.message : "DELETE_FAILED",
        });
      }
    }

    await writeAuditLog(session, "vm.snapshot.delete", {
      serverId: id,
      detail: `vmid=${vmidNum} ok=${results.ok.length} failed=${results.failed.length} names=${names.join(",")}`,
    });

    return NextResponse.json({ results });
  } catch (err) {
    return handleApiError(err);
  }
}
