import webPush from "web-push";
import { prisma } from "@/lib/prisma";

interface VapidKeySet {
  publicKey: string;
  privateKey: string;
  subject: string;
}

let vapidKeys: Promise<VapidKeySet> | null = null;

async function loadOrGenerateVapidKeys(): Promise<VapidKeySet> {
  // Manuell per .env gesetzte Keys haben Vorrang (z.B. wenn mehrere
  // Instanzen dieselben Keys teilen müssen).
  const envPublic = process.env.VAPID_PUBLIC_KEY;
  const envPrivate = process.env.VAPID_PRIVATE_KEY;
  if (envPublic && envPrivate) {
    return {
      publicKey: envPublic,
      privateKey: envPrivate,
      subject: process.env.VAPID_SUBJECT || "mailto:admin@localhost",
    };
  }

  const existing = await prisma.vapidKeys.findUnique({ where: { id: "singleton" } });
  if (existing) return existing;

  // Race bei gleichzeitigem Erststart mehrerer Prozesse: upsert auf die feste
  // Singleton-ID sorgt dafür, dass am Ende alle Prozesse dasselbe Schlüssel-
  // paar verwenden, statt dass jeder Prozess sein eigenes anlegt (was dazu
  // führen würde, dass auf einzelnen Geräten registrierte Subscriptions mit
  // dem "falschen" Key signiert werden und Zustellungen dort dauerhaft und
  // unbemerkt fehlschlagen).
  const generated = webPush.generateVAPIDKeys();
  return prisma.vapidKeys.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
      subject: process.env.VAPID_SUBJECT || "mailto:admin@localhost",
    },
  });
}

// Lädt (und generiert bei Bedarf einmalig) das VAPID-Schlüsselpaar. Wird
// beim Serverstart aufgerufen, damit Push ohne manuellen Setup-Schritt
// funktioniert - läuft aber ebenso lazy, falls doch mal übersprungen.
export async function ensureVapidKeys(): Promise<VapidKeySet> {
  if (!vapidKeys) {
    vapidKeys = loadOrGenerateVapidKeys().catch((err) => {
      vapidKeys = null;
      throw err;
    });
  }
  const keys = await vapidKeys;
  webPush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
  return keys;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface PushSendResult {
  ok: boolean;
  error?: string;
}

// Schickt an eine einzelne Subscription. Ungültig gewordene Subscriptions
// (404/410 vom Push-Dienst, z.B. App deinstalliert) werden dabei aus der DB
// entfernt. Gibt das Ergebnis zurück statt Fehler nur zu loggen, damit
// Aufrufer (z.B. der "Test senden"-Button) den echten Grund anzeigen können.
async function sendPushToSubscription(
  sub: StoredSubscription,
  payload: PushPayload
): Promise<PushSendResult> {
  try {
    await webPush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload)
    );
    return { ok: true };
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    const body = (err as { body?: string }).body;
    const message = err instanceof Error ? err.message : String(err);

    if (statusCode === 404 || statusCode === 410) {
      await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      return { ok: false, error: "Subscription ist nicht mehr gültig und wurde entfernt" };
    }

    console.error(
      `push notification failed for subscription ${sub.id} (status ${statusCode ?? "?"}): ${message}${body ? ` — body: ${body}` : ""}`
    );
    return {
      ok: false,
      error: statusCode
        ? `Push-Versand fehlgeschlagen (HTTP ${statusCode}): ${message}${body ? ` — ${body}` : ""}`
        : message,
    };
  }
}

// Schickt eine Push-Nachricht an alle Endpunkte (Geräte) eines Users.
export async function sendPushToUser(userId: string, payload: PushPayload) {
  await ensureVapidKeys();

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return;

  const results = await Promise.all(subscriptions.map((sub) => sendPushToSubscription(sub, payload)));
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(
      `push notification "${payload.title}" failed for ${failed.length}/${subscriptions.length} subscription(s) of user ${userId}`
    );
  }
}

// Schickt eine Push-Nachricht an genau ein Gerät (z.B. für den
// "Test senden"-Button, der nur das aktuell benutzte Gerät prüfen soll).
// Gibt den tatsächlichen Fehler zurück statt einen pauschalen Erfolg zu
// melden, damit der Nutzer sieht, woran eine fehlgeschlagene Zustellung liegt.
export async function sendPushToSubscriptionByEndpoint(
  userId: string,
  endpoint: string,
  payload: PushPayload
): Promise<PushSendResult & { found: boolean }> {
  await ensureVapidKeys();

  const sub = await prisma.pushSubscription.findFirst({ where: { userId, endpoint } });
  if (!sub) return { ok: false, found: false, error: "Keine aktive Push-Subscription für dieses Gerät" };

  const result = await sendPushToSubscription(sub, payload);
  return { ...result, found: true };
}

export type NotificationEvent =
  | "offlineEnabled"
  | "dockerStoppedEnabled"
  | "cpuWarnEnabled"
  | "cpuCritEnabled"
  | "memWarnEnabled"
  | "memCritEnabled"
  | "diskWarnEnabled"
  | "diskCritEnabled"
  | "netWarnEnabled"
  | "netCritEnabled";

export const NOTIFICATION_DEFAULTS: Record<NotificationEvent, boolean> = {
  offlineEnabled: true,
  dockerStoppedEnabled: false,
  cpuWarnEnabled: false,
  cpuCritEnabled: true,
  memWarnEnabled: false,
  memCritEnabled: true,
  diskWarnEnabled: false,
  diskCritEnabled: true,
  netWarnEnabled: false,
  netCritEnabled: true,
};

// Schickt eine Push-Nachricht an alle User, die für diesen Server und dieses
// Ereignis benachrichtigt werden wollen (Default gilt, solange kein
// expliziter Eintrag in NotificationPreference existiert).
export async function notifyServerEvent(
  serverId: string,
  event: NotificationEvent,
  payload: PushPayload
) {
  await ensureVapidKeys();

  const [users, prefs] = await Promise.all([
    prisma.user.findMany({
      where: { pushSubscriptions: { some: {} } },
      select: { id: true },
    }),
    prisma.notificationPreference.findMany({ where: { serverId } }),
  ]);
  if (users.length === 0) return;

  const prefByUser = new Map(prefs.map((p) => [p.userId, p]));

  await Promise.all(
    users.map((u) => {
      const pref = prefByUser.get(u.id);
      const enabled = pref ? pref[event] : NOTIFICATION_DEFAULTS[event];
      if (!enabled) return Promise.resolve();
      return sendPushToUser(u.id, payload);
    })
  );
}
