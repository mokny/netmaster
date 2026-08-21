import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-helpers";
import { sendPushToSubscriptionByEndpoint } from "@/lib/push";

// Testet gezielt nur das Gerät, von dem aus der Request kommt (per
// Subscription-Endpoint identifiziert) - nicht alle Geräte des Accounts.
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { endpoint } = await req.json().catch(() => ({ endpoint: undefined }));
    if (!endpoint || typeof endpoint !== "string") {
      throw new ApiError(400, "Dieses Gerät hat keine aktive Push-Subscription");
    }

    const result = await sendPushToSubscriptionByEndpoint(session.userId, endpoint, {
      title: "Test-Benachrichtigung",
      body: "Wenn du das siehst, funktionieren Push-Benachrichtigungen.",
      url: "/account",
    });
    if (!result.ok) {
      throw new ApiError(400, result.error ?? "Test-Benachrichtigung fehlgeschlagen");
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
