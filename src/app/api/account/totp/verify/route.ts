import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-helpers";
import { verifyTotpSetupCode } from "@/lib/totp";
import { generateBackupCodes } from "@/lib/backup-codes";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => null);
    const code = typeof body?.code === "string" ? body.code.trim() : "";

    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
    if (!user.totpSecret) {
      throw new ApiError(400, "TOTP_SETUP_NOT_PENDING");
    }

    if (!(await verifyTotpSetupCode(user.totpSecret, code))) {
      throw new ApiError(400, "INVALID_CODE");
    }

    await prisma.user.update({
      where: { id: session.userId },
      data: { totpEnabled: true },
    });
    const backupCodes = await generateBackupCodes(session.userId);

    await writeAuditLog(session, "account.totp_enabled");

    return NextResponse.json({ backupCodes });
  } catch (err) {
    return handleApiError(err);
  }
}
