import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError, ApiError, requireStorageEnabled } from "@/lib/api-helpers";

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
    const mountTransport = body.mountTransport === "NFS" ? "NFS" : "SSHFS";
    const quotaBytes =
      typeof body.quotaBytes === "number" && body.quotaBytes > 0
        ? BigInt(Math.floor(body.quotaBytes))
        : null;

    if (!name || !serverId || !remotePath) {
      throw new ApiError(400, "NAME_SERVER_PATH_REQUIRED");
    }

    const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
    requireStorageEnabled(server);

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
