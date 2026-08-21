import { requireRole, handleApiError } from "@/lib/api-helpers";
import { resolveDockerFileBackend } from "@/lib/exec-file-target";
import { handleExecUpload } from "@/lib/exec-file-routes";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ serverId: string; containerId: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { serverId, containerId } = await params;
    const { backend, detail } = await resolveDockerFileBackend(serverId, containerId);
    return handleExecUpload(backend, req, session, { serverId, detail });
  } catch (err) {
    return handleApiError(err);
  }
}
