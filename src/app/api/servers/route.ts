import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { requireRole, requireSession, handleApiError, ApiError } from "@/lib/api-helpers";

export async function GET() {
  try {
    await requireSession();
    const servers = await prisma.server.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        hostname: true,
        sshPort: true,
        sshUsername: true,
        authType: true,
        pollIntervalSec: true,
        retentionDays: true,
        dockerEnabled: true,
        proxmoxEnabled: true,
        cpuWarn: true,
        cpuCrit: true,
        memWarn: true,
        memCrit: true,
        diskWarn: true,
        diskCrit: true,
        description: true,
        tags: true,
        lastStatus: true,
        lastError: true,
        lastCheckedAt: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ servers });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireRole("EDITOR");
    const body = await req.json();

    const name = String(body.name ?? "").trim();
    const hostname = String(body.hostname ?? "").trim();
    const sshUsername = String(body.sshUsername ?? "").trim();
    const sshPort = Number(body.sshPort ?? 22);
    const authType = body.authType === "PRIVATE_KEY" ? "PRIVATE_KEY" : "PASSWORD";
    const secret = String(body.secret ?? "");
    const passphrase = String(body.passphrase ?? "");
    const sudoPassword = String(body.sudoPassword ?? "");

    if (!name || !hostname || !sshUsername || !secret) {
      throw new ApiError(
        400,
        "Name, Hostname, SSH-Benutzer und Passwort/Key sind erforderlich"
      );
    }

    const server = await prisma.server.create({
      data: {
        name,
        hostname,
        sshPort,
        sshUsername,
        authType,
        encryptedSecret: encryptSecret(secret),
        encryptedPassphrase:
          authType === "PRIVATE_KEY" && passphrase ? encryptSecret(passphrase) : null,
        encryptedSudoPassword: sudoPassword ? encryptSecret(sudoPassword) : null,
        pollIntervalSec: Number(body.pollIntervalSec ?? 30),
        retentionDays: Number(body.retentionDays ?? 30),
        dockerEnabled: Boolean(body.dockerEnabled ?? false),
        proxmoxEnabled: Boolean(body.proxmoxEnabled ?? false),
        cpuWarn: Number(body.cpuWarn ?? 70),
        cpuCrit: Number(body.cpuCrit ?? 90),
        memWarn: Number(body.memWarn ?? 75),
        memCrit: Number(body.memCrit ?? 90),
        diskWarn: Number(body.diskWarn ?? 80),
        diskCrit: Number(body.diskCrit ?? 95),
        description: String(body.description ?? ""),
        tags: String(body.tags ?? ""),
      },
      select: {
        id: true,
        name: true,
        hostname: true,
        sshPort: true,
        sshUsername: true,
        authType: true,
        pollIntervalSec: true,
        retentionDays: true,
        lastStatus: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ server }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
