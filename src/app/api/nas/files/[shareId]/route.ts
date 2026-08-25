import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireNasSession, handleNasApiError, NasApiError } from "@/lib/nas-api-helpers";

// Reiner Proxy zur Gateway-Datei-API (siehe gateway/src/files-api.ts) - der
// Hauptcontainer selbst hat keinen Zugriff auf die per SSHFS/NFS gemounteten
// Dateien, nur der Gateway-Container. Prüft hier Mitgliedschaft + Rolle,
// bevor der Request an den Gateway weitergereicht wird.
async function loadMembership(shareId: string, nasUserId: string) {
  const membership = await prisma.nasShareMember.findUnique({
    where: { shareId_nasUserId: { shareId, nasUserId } },
    include: { share: true },
  });
  if (!membership) throw new NasApiError(403, "FORBIDDEN_ROLE");
  return membership;
}

function gatewayBase(): string {
  const url = process.env.NAS_GATEWAY_INTERNAL_URL;
  if (!url) throw new NasApiError(503, "NAS_GATEWAY_NOT_CONFIGURED");
  return url;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  try {
    const session = await requireNasSession();
    const { shareId } = await params;
    await loadMembership(shareId, session.nasUserId);

    const { search } = new URL(req.url);
    const res = await fetch(`${gatewayBase()}/files/${shareId}${search}`, {
      headers: { "x-internal-secret": process.env.NAS_INTERNAL_SECRET ?? "" },
    });
    return new NextResponse(res.body, {
      status: res.status,
      headers: res.headers,
    });
  } catch (err) {
    return handleNasApiError(err);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  try {
    const session = await requireNasSession();
    const { shareId } = await params;
    const membership = await loadMembership(shareId, session.nasUserId);
    if (membership.role === "READ_ONLY") throw new NasApiError(403, "FORBIDDEN_ROLE");
    if (membership.share.readOnlyLocked) throw new NasApiError(403, "SHARE_QUOTA_EXCEEDED");

    const { search } = new URL(req.url);
    const res = await fetch(`${gatewayBase()}/files/${shareId}${search}`, {
      method: "POST",
      // @ts-expect-error - duplex ist bei Node-fetch mit Stream-Body nötig, im DOM-Typ aber nicht deklariert
      duplex: "half",
      headers: {
        "x-internal-secret": process.env.NAS_INTERNAL_SECRET ?? "",
        "content-type": req.headers.get("content-type") ?? "application/octet-stream",
      },
      body: req.body,
    });
    return new NextResponse(res.body, { status: res.status, headers: res.headers });
  } catch (err) {
    return handleNasApiError(err);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  try {
    const session = await requireNasSession();
    const { shareId } = await params;
    const membership = await loadMembership(shareId, session.nasUserId);
    if (membership.role === "READ_ONLY") throw new NasApiError(403, "FORBIDDEN_ROLE");

    const { search } = new URL(req.url);
    const res = await fetch(`${gatewayBase()}/files/${shareId}${search}`, {
      method: "DELETE",
      headers: { "x-internal-secret": process.env.NAS_INTERNAL_SECRET ?? "" },
    });
    return new NextResponse(res.body, { status: res.status, headers: res.headers });
  } catch (err) {
    return handleNasApiError(err);
  }
}
