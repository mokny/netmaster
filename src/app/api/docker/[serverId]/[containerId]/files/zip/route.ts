import { requireRole, handleApiError } from "@/lib/api-helpers";
import { resolveDockerFileBackend } from "@/lib/exec-file-target";
import { handleExecZip } from "@/lib/exec-file-routes";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ serverId: string; containerId: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { serverId, containerId } = await params;
    const url = new URL(req.url);
    const dirPath = url.searchParams.get("path") ?? "";
    const { backend, detail } = await resolveDockerFileBackend(serverId, containerId);
    return handleExecZip(backend, dirPath, session, { serverId, detail });
  } catch (err) {
    return handleApiError(err);
  }
}
