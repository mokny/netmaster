import { requireRole, handleApiError } from "@/lib/api-helpers";
import { resolveProxmoxFileBackend } from "@/lib/exec-file-target";
import { handleExecUpload } from "@/lib/exec-file-routes";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ serverId: string; vmid: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { serverId, vmid } = await params;
    const { backend, detail } = await resolveProxmoxFileBackend(serverId, Number(vmid));
    return handleExecUpload(backend, req, session, { serverId, detail });
  } catch (err) {
    return handleApiError(err);
  }
}
