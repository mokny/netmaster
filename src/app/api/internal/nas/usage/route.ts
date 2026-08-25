import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireInternalSecret } from "@/lib/nas-internal-auth";

// Vom Gateway-Quota-Checker periodisch (nach jedem `du -sb` je Mountpoint)
// aufgerufen. Setzt readOnlyLocked, sobald usedBytes das Limit übersteigt,
// und schreibt bei einem Übergang in den gesperrten Zustand ein
// NasAuditLog-Event (nur beim Übergang, kein Log-Spam bei jedem Poll).
export async function POST(req: Request) {
  const authError = requireInternalSecret(req);
  if (authError) return authError;

  const body = await req.json().catch(() => null);
  const shareId = typeof body?.shareId === "string" ? body.shareId : "";
  const usedBytesRaw = body?.usedBytes;
  if (!shareId || (typeof usedBytesRaw !== "number" && typeof usedBytesRaw !== "string")) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }
  const usedBytes = BigInt(usedBytesRaw);

  const share = await prisma.nasShare.findUnique({ where: { id: shareId } });
  if (!share) {
    return NextResponse.json({ error: "SHARE_NOT_FOUND" }, { status: 404 });
  }

  const overQuota = share.quotaBytes != null && usedBytes > share.quotaBytes;
  const wasLocked = share.readOnlyLocked;

  await prisma.nasShare.update({
    where: { id: shareId },
    data: {
      usedBytes,
      lastUsageCheckAt: new Date(),
      readOnlyLocked: overQuota,
    },
  });

  if (overQuota && !wasLocked) {
    await prisma.nasAuditLog.create({
      data: {
        nasUserEmail: "",
        action: "QUOTA_EXCEEDED",
        detail: `Freigabe "${share.name}" hat das Quota überschritten (${usedBytes} > ${share.quotaBytes} Bytes).`,
      },
    });
  }

  return NextResponse.json({ ok: true, readOnlyLocked: overQuota });
}
