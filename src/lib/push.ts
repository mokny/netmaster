import webPush from "web-push";
import { prisma } from "@/lib/prisma";

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webPush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
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
  if (!ensureConfigured()) return;

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
  | "warningEnabled"
  | "criticalEnabled"
  | "dockerStoppedEnabled";

export const NOTIFICATION_DEFAULTS: Record<NotificationEvent, boolean> = {
  offlineEnabled: true,
  warningEnabled: false,
  criticalEnabled: true,
  dockerStoppedEnabled: false,
};

// Schickt eine Push-Nachricht an alle User, die für diesen Server und dieses
// Ereignis benachrichtigt werden wollen (Default gilt, solange kein
// expliziter Eintrag in NotificationPreference existiert).
export async function notifyServerEvent(
  serverId: string,
  event: NotificationEvent,
  payload: PushPayload
) {
  if (!ensureConfigured()) return;

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
