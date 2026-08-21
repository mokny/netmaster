import { prisma } from "@/lib/prisma";
import { createExecFileBackend, type FileBackend } from "@/lib/exec-file-backend";
import { createQemuGuestBackend } from "@/lib/qemu-guest-backend";

// Bewusst ohne Abhängigkeit auf api-helpers.ts (importiert "next/server" auf
// Modulebene) - diese Datei wird auch von server.ts außerhalb des
// Next-Runtimes importiert (WS-Upgrade-Handling), wo das zum Absturz führt.
export class ExecTargetError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function resolveDockerFileBackend(
  serverId: string,
  containerId: string
): Promise<{ backend: FileBackend; detail: string }> {
  if (!/^[a-zA-Z0-9]+$/.test(containerId)) throw new ExecTargetError(400, "Invalid container ID");
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) throw new ExecTargetError(404, "Server nicht gefunden");
  const backend = createExecFileBackend(server, ["docker", "exec", "-i", containerId], false);
  return { backend, detail: `docker:${containerId}` };
}

export async function resolveProxmoxFileBackend(
  serverId: string,
  vmid: number
): Promise<{ backend: FileBackend; detail: string }> {
  if (!Number.isInteger(vmid) || vmid <= 0) throw new ExecTargetError(400, "Invalid VM ID");
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) throw new ExecTargetError(404, "Server nicht gefunden");
  const vm = await prisma.proxmoxVm.findUnique({ where: { serverId_vmid: { serverId, vmid } } });
  if (!vm) throw new ExecTargetError(404, "VM nicht gefunden");
  const backend =
    vm.type === "QEMU"
      ? createQemuGuestBackend(server, vmid)
      : createExecFileBackend(server, ["pct", "exec", String(vmid), "--"], true);
  return { backend, detail: `${vm.type.toLowerCase()}:${vmid}` };
}
