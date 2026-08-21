import { requireRole, handleApiError } from "@/lib/api-helpers";
import { resolveProxmoxFileBackend } from "@/lib/exec-file-target";
import { handleExecZip } from "@/lib/exec-file-routes";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ serverId: string; vmid: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { serverId, vmid } = await params;
    const url = new URL(req.url);
    const dirPath = url.searchParams.get("path") ?? "";
    const { backend, detail } = await resolveProxmoxFileBackend(serverId, Number(vmid));
    return handleExecZip(backend, dirPath, session, { serverId, detail });
  } catch (err) {
    return handleApiError(err);
  }
}
