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

  const share = await prisma.nasShare.findUnique({
    where: { id: shareId },
    include: { members: true },
  });
  if (!share) {
    return NextResponse.json({ error: "SHARE_NOT_FOUND" }, { status: 404 });
  }

  const overShareQuota = share.quotaBytes != null && usedBytes > share.quotaBytes;
  const wasLocked = share.readOnlyLocked;

  // Private Freigabe (genau ein Mitglied): zusätzlich gegen die Quota des
  // Users prüfen, siehe Schema-Kommentar an NasUser.quotaBytes. Nur Sperren,
  // nie automatisch entsperren (gleiche No-Flapping-Regel wie bei der
  // Share-Quota oben).
  let overUserQuota = false;
  const soleMember = share.members.length === 1 ? share.members[0] : null;
  if (soleMember) {
    const owner = await prisma.nasUser.findUnique({ where: { id: soleMember.nasUserId } });
    if (owner?.quotaBytes != null) {
      const otherPrivateShares = await prisma.nasShare.findMany({
        where: { id: { not: shareId }, members: { every: { nasUserId: owner.id } }, NOT: { members: { none: {} } } },
        include: { _count: { select: { members: true } } },
      });
      const otherPrivateUsage = otherPrivateShares
        .filter((s) => s._count.members === 1)
        .reduce((sum, s) => sum + s.usedBytes, BigInt(0));
      overUserQuota = usedBytes + otherPrivateUsage > owner.quotaBytes;
    }
  }

  const readOnlyLocked = overShareQuota || overUserQuota;

  await prisma.nasShare.update({
    where: { id: shareId },
    data: {
      usedBytes,
      lastUsageCheckAt: new Date(),
      readOnlyLocked,
    },
  });

  if (readOnlyLocked && !wasLocked) {
    const reason = overShareQuota
      ? `Freigabe "${share.name}" hat das Quota überschritten (${usedBytes} > ${share.quotaBytes} Bytes).`
      : `Freigabe "${share.name}" hat die persönliche Quota des Users überschritten.`;
    await prisma.nasAuditLog.create({
      data: {
        nasUserEmail: "",
        action: "QUOTA_EXCEEDED",
        detail: reason,
      },
    });
  }

  return NextResponse.json({ ok: true, readOnlyLocked });
}
