import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError, ApiError, requireProxmoxEnabled } from "@/lib/api-helpers";
import { execOnServer, buildBackupDeleteCommand } from "@/lib/ssh";
import { writeAuditLog } from "@/lib/audit";

interface BackupRef {
  storage: string;
  volid: string;
}

interface BatchResult {
  ok: string[];
  failed: { volid: string; error: string }[];
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
    const items: BackupRef[] = Array.isArray(body.items)
      ? body.items.filter(
          (i: unknown): i is BackupRef =>
            !!i &&
            typeof (i as BackupRef).storage === "string" &&
            typeof (i as BackupRef).volid === "string"
        )
      : [];
    if (items.length === 0) throw new ApiError(400, "NO_BACKUPS_SELECTED");

    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    requireProxmoxEnabled(server);

    const results: BatchResult = { ok: [], failed: [] };
    for (const item of items) {
      try {
        const { command, stdin } = buildBackupDeleteCommand(server, item.storage, item.volid);
        const result = await execOnServer(server, command, 60_000, stdin);
        if (result.code !== 0 && result.code !== null) {
          results.failed.push({
            volid: item.volid,
            error: result.stderr.trim() || "DELETE_FAILED",
          });
        } else {
          results.ok.push(item.volid);
        }
      } catch (err) {
        results.failed.push({
          volid: item.volid,
          error: err instanceof Error ? err.message : "DELETE_FAILED",
        });
      }
    }

    await writeAuditLog(session, "vm.backup.delete", {
      serverId: id,
      detail: `vmid=${vmidNum} ok=${results.ok.length} failed=${results.failed.length}`,
    });

    return NextResponse.json({ results });
  } catch (err) {
    return handleApiError(err);
  }
}
