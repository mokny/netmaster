import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError, ApiError, requireStorageEnabled } from "@/lib/api-helpers";
import { execOnServer, shellQuote } from "@/lib/ssh";

const INCLUDE = {
  members: { include: { nasUser: { select: { id: true, email: true, name: true } } } },
  server: { select: { id: true, name: true, hostname: true } },
} as const;

export async function GET() {
  try {
    await requireRole("ADMIN");
    const shares = await prisma.nasShare.findMany({
      orderBy: { createdAt: "asc" },
      include: INCLUDE,
    });
    return NextResponse.json({
      shares: shares.map((s) => ({ ...s, quotaBytes: s.quotaBytes?.toString() ?? null, usedBytes: s.usedBytes.toString() })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireRole("ADMIN");
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const serverId = String(body.serverId ?? "");
    const remotePath = String(body.remotePath ?? "").trim();
    // Nur SSHFS wird angeboten: braucht am Zielserver nur normales SSH, das
    // NetMaster für dessen Monitoring ohnehin schon nutzt - NFS bräuchte
    // dort zusätzlich einen eigens konfigurierten NFS-Export.
    const mountTransport = "SSHFS" as const;
    const quotaBytes =
      typeof body.quotaBytes === "number" && body.quotaBytes > 0
        ? BigInt(Math.floor(body.quotaBytes))
        : null;

    if (!name || !serverId || !remotePath) {
      throw new ApiError(400, "NAME_SERVER_PATH_REQUIRED");
    }

    const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
    requireStorageEnabled(server);

    // "Wizard für Dummies": Zielverzeichnis bei Bedarf anlegen und vor dem
    // Speichern per SSH prüfen, dass der Mount später tatsächlich
    // funktionieren wird, statt erst beim (asynchronen) SSHFS-Mount im
    // Gateway einen schwer nachvollziehbaren Fehler zu produzieren.
    let checkResult;
    try {
      checkResult = await execOnServer(
        server,
        `mkdir -p -- ${shellQuote(remotePath)} && test -w ${shellQuote(remotePath)}`,
        15_000
      );
    } catch (err) {
      throw new ApiError(400, "REMOTE_PATH_CHECK_FAILED", err instanceof Error ? err.message : undefined);
    }
    if (checkResult.code !== 0) {
      throw new ApiError(400, "REMOTE_PATH_CHECK_FAILED", checkResult.stderr.trim() || checkResult.stdout.trim());
    }

    const share = await prisma.nasShare.create({
      data: { name, serverId, remotePath, mountTransport, quotaBytes },
      include: INCLUDE,
    });

    return NextResponse.json(
      { share: { ...share, quotaBytes: share.quotaBytes?.toString() ?? null, usedBytes: share.usedBytes.toString() } },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
