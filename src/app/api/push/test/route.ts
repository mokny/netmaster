import { NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

export async function POST() {
  try {
    const session = await requireSession();

    const hasSubscription = await prisma.pushSubscription.findFirst({
      where: { userId: session.userId },
      select: { id: true },
    });
    if (!hasSubscription) {
      throw new ApiError(400, "Keine aktive Push-Subscription für diesen Account");
    }

    await sendPushToUser(session.userId, {
      title: "Test-Benachrichtigung",
      body: "Wenn du das siehst, funktionieren Push-Benachrichtigungen.",
      url: "/account",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
