import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireSession,
  requireRole,
  handleApiError,
  ApiError,
  requireProxmoxEnabled,
} from "@/lib/api-helpers";
import {
  execOnServer,
  STORAGE_LIST_COMMAND,
  buildBackupListCommand,
  buildBackupCreateCommand,
} from "@/lib/ssh";
import { parseStorageListOutput, parseBackupListOutput } from "@/lib/monitor/parse";
import { writeAuditLog } from "@/lib/audit";
import type { Server as ServerModel } from "@/generated/prisma/client";

async function loadVm(id: string, vmidNum: number) {
  if (!Number.isInteger(vmidNum)) throw new ApiError(400, "INVALID_VM_ID");
  const server = await prisma.server.findUniqueOrThrow({ where: { id } });
  requireProxmoxEnabled(server);
  const vm = await prisma.proxmoxVm.findUnique({
    where: { serverId_vmid: { serverId: id, vmid: vmidNum } },
  });
  if (!vm) throw new ApiError(404, "VM_NOT_FOUND");
  return { server, vm };
}

async function discoverBackupStorages(server: ServerModel): Promise<string[]> {
  const result = await execOnServer(server, STORAGE_LIST_COMMAND, 15_000);
  return parseStorageListOutput(result.stdout).map((s) => s.storage);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; vmid: string }> }
) {
  try {
    await requireSession();
    const { id, vmid } = await params;
    const { server, vm } = await loadVm(id, Number(vmid));

    const storages = await discoverBackupStorages(server);
    const backups = [];
    for (const storage of storages) {
      const command = buildBackupListCommand(storage, vm.vmid);
      const result = await execOnServer(server, command, 15_000);
      backups.push(...parseBackupListOutput(result.stdout, storage));
    }
    backups.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

    return NextResponse.json({ backups, storages });
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
    const storage = typeof body.storage === "string" ? body.storage : "";
    const mode = body.mode === "suspend" || body.mode === "stop" ? body.mode : "snapshot";
    const compress =
      body.compress === "gzip" || body.compress === "lzo" || body.compress === "0"
        ? body.compress
        : "zstd";
    if (!storage) throw new ApiError(400, "STORAGE_REQUIRED");

    let command: string;
    let stdin: string | undefined;
    try {
      ({ command, stdin } = buildBackupCreateCommand(server, vm.vmid, { storage, mode, compress }));
    } catch (err) {
      throw new ApiError(400, "INVALID_INPUT", err instanceof Error ? err.message : undefined);
    }

    const result = await execOnServer(server, command, 30 * 60_000, stdin);
    if (result.code !== 0 && result.code !== null) {
      throw new ApiError(500, "BACKUP_FAILED", result.stderr.trim() || undefined);
    }

    await writeAuditLog(session, "vm.backup.create", {
      serverId: id,
      detail: `vmid=${vm.vmid} storage=${storage} mode=${mode} compress=${compress}`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
