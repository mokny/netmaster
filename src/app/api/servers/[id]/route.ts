import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { requireRole, requireSession, handleApiError } from "@/lib/api-helpers";

const SERVER_SELECT = {
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
  updatedAt: true,
} as const;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;
    const server = await prisma.server.findUniqueOrThrow({
      where: { id },
      select: SERVER_SELECT,
    });
    return NextResponse.json({ server });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("EDITOR");
    const { id } = await params;
    const body = await req.json();

    const data: Record<string, unknown> = {};
    const strFields = ["name", "hostname", "sshUsername", "description", "tags"];
    for (const f of strFields) {
      if (typeof body[f] === "string") data[f] = body[f];
    }
    const numFields = [
      "sshPort",
      "pollIntervalSec",
      "retentionDays",
      "cpuWarn",
      "cpuCrit",
      "memWarn",
      "memCrit",
      "diskWarn",
      "diskCrit",
    ];
    for (const f of numFields) {
      if (body[f] !== undefined) data[f] = Number(body[f]);
    }
    if (body.authType === "PASSWORD" || body.authType === "PRIVATE_KEY") {
      data.authType = body.authType;
    }
    if (typeof body.dockerEnabled === "boolean") data.dockerEnabled = body.dockerEnabled;
    if (typeof body.proxmoxEnabled === "boolean") data.proxmoxEnabled = body.proxmoxEnabled;
    if (typeof body.secret === "string" && body.secret.length > 0) {
      data.encryptedSecret = encryptSecret(body.secret);
    }
    if (typeof body.passphrase === "string" && body.passphrase.length > 0) {
      data.encryptedPassphrase = encryptSecret(body.passphrase);
    }
    if (typeof body.sudoPassword === "string" && body.sudoPassword.length > 0) {
      data.encryptedSudoPassword = encryptSecret(body.sudoPassword);
    }

    const server = await prisma.server.update({
      where: { id },
      data,
      select: SERVER_SELECT,
    });

    return NextResponse.json({ server });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("ADMIN");
    const { id } = await params;
    await prisma.server.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

