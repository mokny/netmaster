import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireDockerEnabled, handleApiError, ApiError } from "@/lib/api-helpers";
import { execOnServer, buildCleanupCommand, type CleanupOptions } from "@/lib/ssh";
import { writeAuditLog } from "@/lib/audit";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { id } = await params;
    const body = await req.json();

    const opts: CleanupOptions = {
      apt: body.apt === true,
      docker: body.docker === true,
      dockerVolumes: body.dockerVolumes === true,
      journal: body.journal === true,
      journalDays: Number(body.journalDays ?? 7),
      dryRun: body.dryRun === true,
    };

    if (!opts.apt && !opts.docker && !opts.journal) {
      throw new ApiError(400, "Keine Bereinigungs-Option ausgewählt");
    }

    const server = await prisma.server.findUniqueOrThrow({ where: { id } });

    if (opts.docker) {
      requireDockerEnabled(server);
    }

    let command: string;
    let stdin: string | undefined;
    try {
      ({ command, stdin } = buildCleanupCommand(server, opts));
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : "Ungültige Konfiguration");
    }

    const result = await execOnServer(server, command, 120_000, stdin);

    if (!opts.dryRun) {
      const targets = [
        opts.apt && "apt",
        opts.docker && "docker",
        opts.journal && "journal",
      ]
        .filter(Boolean)
        .join(",");
      await writeAuditLog(session, "server.cleanup", {
        serverId: id,
        detail: `targets=${targets}`,
      });
    }

    return NextResponse.json({
      ok: true,
      output: result.stdout,
      errorOutput: result.stderr,
      code: result.code,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
