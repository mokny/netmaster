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

  const existing = await prisma.vapidKeys.findFirst();
  if (existing) return existing;

  const generated = webPush.generateVAPIDKeys();
  return prisma.vapidKeys.create({
    data: {
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

// Schickt eine Push-Nachricht an alle Endpunkte eines Users. Ungültig
// gewordene Subscriptions (404/410 vom Push-Dienst, z.B. App deinstalliert)
// werden dabei aus der DB entfernt.
export async function sendPushToUser(userId: string, payload: PushPayload) {
  await ensureVapidKeys();

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload)
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    })
  );
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
