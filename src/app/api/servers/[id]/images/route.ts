import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireSession,
  requireRole,
  handleApiError,
  ApiError,
  requireDockerEnabled,
} from "@/lib/api-helpers";
import { execOnServer, buildDockerPullCommand } from "@/lib/ssh";
import { writeAuditLog } from "@/lib/audit";
import { collectDockerImages } from "@/lib/monitor/collect";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;

    const latest = await prisma.dockerImageSnapshot.findFirst({
      where: { serverId: id },
      orderBy: { timestamp: "desc" },
    });
    if (!latest) return NextResponse.json({ images: [], timestamp: null });

    const images = await prisma.dockerImageSnapshot.findMany({
      where: { serverId: id, timestamp: latest.timestamp },
      orderBy: { repository: "asc" },
    });

    return NextResponse.json({ images, timestamp: latest.timestamp });
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
    if (!image) throw new ApiError(400, "Image-Name erforderlich");

    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    requireDockerEnabled(server);

    let command: string;
    try {
      command = buildDockerPullCommand(image);
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : "Ungültiger Image-Name");
    }

    const result = await execOnServer(server, command, 5 * 60_000);
    if (result.code !== 0 && result.code !== null) {
      throw new ApiError(500, result.stderr.trim() || "Pull fehlgeschlagen");
    }

    await writeAuditLog(session, "docker.image.pull", {
      serverId: id,
      detail: `image=${image}`,
    });

    await collectDockerImages(server);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
