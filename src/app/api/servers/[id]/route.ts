import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { requireRole, requireSession, handleApiError } from "@/lib/api-helpers";
import { invalidatePooledConnection } from "@/lib/ssh-pool";

const CONNECTION_FIELDS = [
  "hostname",
  "sshPort",
  "sshUsername",
  "authType",
  "encryptedSecret",
  "encryptedPassphrase",
];

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
  networkToolsEnabled: true,
  cpuWarn: true,
  cpuCrit: true,
  memWarn: true,
  memCrit: true,
  diskWarn: true,
  diskCrit: true,
  netUploadWarn: true,
  netUploadCrit: true,
  netDownloadWarn: true,
  netDownloadCrit: true,
  description: true,
  tags: true,
  lastStatus: true,
  lastError: true,
  lastCheckedAt: true,
  createdAt: true,
  updatedAt: true,
  cpuCores: true,
  memTotalMb: true,
  osName: true,
  kernelVersion: true,
  bootedAt: true,
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
      "netUploadWarn",
      "netUploadCrit",
      "netDownloadWarn",
      "netDownloadCrit",
    ];
    for (const f of numFields) {
      if (body[f] !== undefined) data[f] = Number(body[f]);
    }
    if (body.authType === "PASSWORD" || body.authType === "PRIVATE_KEY") {
      data.authType = body.authType;
    }
    if (typeof body.dockerEnabled === "boolean") data.dockerEnabled = body.dockerEnabled;
    if (typeof body.proxmoxEnabled === "boolean") data.proxmoxEnabled = body.proxmoxEnabled;
    if (typeof body.networkToolsEnabled === "boolean")
      data.networkToolsEnabled = body.networkToolsEnabled;
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

    // Verbindungsrelevante Felder geändert: gepoolte Verbindung verwirft
    // sich sonst erst beim nächsten Auth-Fehler statt sofort mit den neuen
    // Zugangsdaten neu zu verbinden.
    if (CONNECTION_FIELDS.some((f) => f in data)) {
      invalidatePooledConnection(id);
    }

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
    invalidatePooledConnection(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

