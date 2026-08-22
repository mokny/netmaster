import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireSession,
  requireRole,
  handleApiError,
  ApiError,
  requireDockerEnabled,
} from "@/lib/api-helpers";
import { execOnServer, buildDockerRunCommand, type DockerRunOptions } from "@/lib/ssh";
import { writeAuditLog } from "@/lib/audit";
import { collectDockerContainers } from "@/lib/monitor/collect";
import { attachIps, dockerIpKey } from "@/lib/monitor/ip-cache";
import { ensureFreshDockerPoll } from "@/lib/monitor/scheduler";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;

    ensureFreshDockerPoll(id);

    const latest = await prisma.dockerContainerSnapshot.findFirst({
      where: { serverId: id },
      orderBy: { timestamp: "desc" },
    });
    if (!latest) return NextResponse.json({ containers: [], timestamp: null });

    const containers = await prisma.dockerContainerSnapshot.findMany({
      where: { serverId: id, timestamp: latest.timestamp },
    });
    const withIps = attachIps(containers, (c) => dockerIpKey(c.serverId, c.containerId));

    return NextResponse.json({ containers: withIps, timestamp: latest.timestamp });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { id } = await params;
    const body = await req.json();

    const image = String(body.image ?? "").trim();
    if (!image) throw new ApiError(400, "IMAGE_REQUIRED");

    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    requireDockerEnabled(server);

    const opts: DockerRunOptions = {
      image,
      name: body.name ? String(body.name).trim() : undefined,
      ports: Array.isArray(body.ports) ? body.ports.map(String) : undefined,
      envs: Array.isArray(body.envs)
        ? body.envs.map((e: { key: string; value: string }) => ({
            key: String(e.key),
            value: String(e.value ?? ""),
          }))
        : undefined,
      volumes: Array.isArray(body.volumes) ? body.volumes.map(String) : undefined,
      restartPolicy: body.restartPolicy,
      network: body.network ? String(body.network).trim() : undefined,
      extraArgs: body.extraArgs ? String(body.extraArgs) : undefined,
    };

    let command: string;
    try {
      command = buildDockerRunCommand(opts);
    } catch (err) {
      throw new ApiError(400, "INVALID_CONFIG", err instanceof Error ? err.message : undefined);
    }

    const result = await execOnServer(server, command, 5 * 60_000);
    if (result.code !== 0 && result.code !== null) {
      throw new ApiError(500, "CREATE_FAILED", result.stderr.trim() || undefined);
    }

    await writeAuditLog(session, "docker.container.create", {
      serverId: id,
      detail: `image=${image} name=${opts.name ?? ""}`,
    });

    await collectDockerContainers(server);

    return NextResponse.json({ ok: true, containerId: result.stdout.trim() });
  } catch (err) {
    return handleApiError(err);
  }
}
