import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// Unauthentifizierter Download-Endpunkt für einen NasShareLink - proxied
// analog zu /api/nas/files/[shareId] an den Gateway, aber ohne Session,
// dafür mit Token/Passwort-Prüfung gegen die DB.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { searchParams } = new URL(req.url);
  const password = searchParams.get("password") ?? "";

  const link = await prisma.nasShareLink.findUnique({ where: { token }, include: { share: true } });
  if (!link || (link.expiresAt && link.expiresAt < new Date())) {
    return NextResponse.json({ error: "LINK_NOT_FOUND" }, { status: 404 });
  }
  if (link.passwordHash && !(await bcrypt.compare(password, link.passwordHash))) {
    return NextResponse.json({ error: "PASSWORD_REQUIRED" }, { status: 401 });
  }

  const gatewayUrl = process.env.NAS_GATEWAY_INTERNAL_URL;
  const secret = process.env.NAS_INTERNAL_SECRET;
  if (!gatewayUrl || !secret) {
    return NextResponse.json({ error: "NAS_GATEWAY_NOT_CONFIGURED" }, { status: 503 });
  }

  const res = await fetch(
    `${gatewayUrl}/files/${link.shareId}?op=read&path=${encodeURIComponent(link.path)}`,
    { headers: { "x-internal-secret": secret } }
  );
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
}
