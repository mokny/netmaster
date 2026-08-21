import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-helpers";
import { sendPushToSubscriptionByEndpoint } from "@/lib/push";
import { getLocale } from "next-intl/server";

// Testet gezielt nur das Gerät, von dem aus der Request kommt (per
// Subscription-Endpoint identifiziert) - nicht alle Geräte des Accounts.
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { endpoint } = await req.json().catch(() => ({ endpoint: undefined }));
    if (!endpoint || typeof endpoint !== "string") {
      throw new ApiError(400, "NO_ACTIVE_PUSH_SUBSCRIPTION");
    }

    const locale = await getLocale();
    const TEST_MESSAGE: Record<string, { title: string; body: string }> = {
      en: { title: "Test notification", body: "If you see this, push notifications are working." },
      de: { title: "Test-Benachrichtigung", body: "Wenn du das siehst, funktionieren Push-Benachrichtigungen." },
      nl: { title: "Testmelding", body: "Als je dit ziet, werken pushmeldingen." },
      fr: { title: "Notification de test", body: "Si vous voyez ceci, les notifications push fonctionnent." },
      es: { title: "Notificación de prueba", body: "Si ves esto, las notificaciones push funcionan." },
    };

    const result = await sendPushToSubscriptionByEndpoint(session.userId, endpoint, {
      ...(TEST_MESSAGE[locale] ?? TEST_MESSAGE.en),
      url: "/account",
    });
    if (!result.ok) {
      throw new ApiError(400, "TEST_NOTIFICATION_FAILED", result.error);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
