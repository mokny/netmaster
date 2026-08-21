import { requireRole, handleApiError } from "@/lib/api-helpers";
import { resolveProxmoxFileBackend } from "@/lib/exec-file-target";
import { handleExecDownload } from "@/lib/exec-file-routes";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ serverId: string; vmid: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { serverId, vmid } = await params;
    const url = new URL(req.url);
    const filePath = url.searchParams.get("path") ?? "";
    const { backend, detail } = await resolveProxmoxFileBackend(serverId, Number(vmid));
    return handleExecDownload(backend, filePath, session, { serverId, detail });
  } catch (err) {
    return handleApiError(err);
  }
}
