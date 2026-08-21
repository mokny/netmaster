import webPush from "web-push";
import { prisma } from "@/lib/prisma";
import { shouldFireDelayedAlert, shouldFireRecovery } from "@/lib/monitor/alert-delay";

interface VapidKeySet {
  publicKey: string;
  privateKey: string;
  subject: string;
}

let vapidKeys: Promise<VapidKeySet> | null = null;

// Fällt ohne VAPID_SUBJECT-Env auf die E-Mail des ältesten Admin-Accounts
// zurück. "mailto:admin@localhost" (früherer Default) wird von Apples
// Push-Dienst mit "BadJwtToken" abgelehnt, siehe
// node_modules/web-push/src/vapid-helper.js (localhost-Hostname-Check).
async function defaultSubject(): Promise<string> {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { email: true },
  });
  return `mailto:${admin?.email ?? "admin@example.com"}`;
}

async function loadOrGenerateVapidKeys(): Promise<VapidKeySet> {
  // Manuell per .env gesetzte Keys haben Vorrang (z.B. wenn mehrere
  // Instanzen dieselben Keys teilen müssen).
  const envPublic = process.env.VAPID_PUBLIC_KEY;
  const envPrivate = process.env.VAPID_PRIVATE_KEY;
  if (envPublic && envPrivate) {
    return {
      publicKey: envPublic,
      privateKey: envPrivate,
      subject: process.env.VAPID_SUBJECT || (await defaultSubject()),
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
      subject: process.env.VAPID_SUBJECT || (await defaultSubject()),
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

// Alle Benachrichtigungen sind reines Opt-in - ohne expliziten Eintrag in
// NotificationPreference ist ein Ereignis aus, Verzögerung 0 und Recovery aus.
export const NOTIFICATION_DEFAULTS: Record<NotificationEvent, boolean> = {
  offlineEnabled: false,
  dockerStoppedEnabled: false,
  cpuWarnEnabled: false,
  cpuCritEnabled: false,
  memWarnEnabled: false,
  memCritEnabled: false,
  diskWarnEnabled: false,
  diskCritEnabled: false,
  netWarnEnabled: false,
  netCritEnabled: false,
};

type DelayField =
  | "offlineDelayMin"
  | "dockerStoppedDelayMin"
  | "cpuWarnDelayMin"
  | "cpuCritDelayMin"
  | "memWarnDelayMin"
  | "memCritDelayMin"
  | "diskWarnDelayMin"
  | "diskCritDelayMin"
  | "netWarnDelayMin"
  | "netCritDelayMin";

type RecoveryField =
  | "offlineRecoveryEnabled"
  | "dockerStoppedRecoveryEnabled"
  | "cpuWarnRecoveryEnabled"
  | "cpuCritRecoveryEnabled"
  | "memWarnRecoveryEnabled"
  | "memCritRecoveryEnabled"
  | "diskWarnRecoveryEnabled"
  | "diskCritRecoveryEnabled"
  | "netWarnRecoveryEnabled"
  | "netCritRecoveryEnabled";

const DELAY_FIELDS: Record<NotificationEvent, DelayField> = {
  offlineEnabled: "offlineDelayMin",
  dockerStoppedEnabled: "dockerStoppedDelayMin",
  cpuWarnEnabled: "cpuWarnDelayMin",
  cpuCritEnabled: "cpuCritDelayMin",
  memWarnEnabled: "memWarnDelayMin",
  memCritEnabled: "memCritDelayMin",
  diskWarnEnabled: "diskWarnDelayMin",
  diskCritEnabled: "diskCritDelayMin",
  netWarnEnabled: "netWarnDelayMin",
  netCritEnabled: "netCritDelayMin",
};

const RECOVERY_FIELDS: Record<NotificationEvent, RecoveryField> = {
  offlineEnabled: "offlineRecoveryEnabled",
  dockerStoppedEnabled: "dockerStoppedRecoveryEnabled",
  cpuWarnEnabled: "cpuWarnRecoveryEnabled",
  cpuCritEnabled: "cpuCritRecoveryEnabled",
  memWarnEnabled: "memWarnRecoveryEnabled",
  memCritEnabled: "memCritRecoveryEnabled",
  diskWarnEnabled: "diskWarnRecoveryEnabled",
  diskCritEnabled: "diskCritRecoveryEnabled",
  netWarnEnabled: "netWarnRecoveryEnabled",
  netCritEnabled: "netCritRecoveryEnabled",
};

type NotificationPreferenceLike = Record<string, unknown> & { userId: string };

async function loadUsersAndPrefs(serverId: string) {
  const [users, prefs] = await Promise.all([
    prisma.user.findMany({
      where: { pushSubscriptions: { some: {} } },
      select: { id: true },
    }),
    prisma.notificationPreference.findMany({ where: { serverId } }),
  ]);
  const prefByUser = new Map(
    (prefs as NotificationPreferenceLike[]).map((p) => [p.userId, p])
  );
  return { users, prefByUser };
}

// Schickt eine (verzögerte) Push-Nachricht an alle User, die für diesen
// Server und dieses Ereignis benachrichtigt werden wollen. `since` ist der
// Zeitpunkt, seit dem der Zustand ununterbrochen besteht (z.B.
// Server.cpuCritSince) - erst wenn die je-User konfigurierte Verzögerung
// überschritten ist, wird zugestellt (siehe alert-delay.ts).
export async function notifyServerEvent(
  serverId: string,
  event: NotificationEvent,
  payload: PushPayload,
  since: Date | null,
  pollIntervalSec: number
) {
  await ensureVapidKeys();
  const { users, prefByUser } = await loadUsersAndPrefs(serverId);
  if (users.length === 0) return;

  const delayField = DELAY_FIELDS[event];

  await Promise.all(
    users.map((u) => {
      const pref = prefByUser.get(u.id);
      const enabled = pref ? Boolean(pref[event]) : NOTIFICATION_DEFAULTS[event];
      if (!enabled) return Promise.resolve();
      const delayMin = pref ? Number(pref[delayField] ?? 0) : 0;
      if (!shouldFireDelayedAlert(since, delayMin, pollIntervalSec)) return Promise.resolve();
      return sendPushToUser(u.id, payload);
    })
  );
}

// Schickt eine Recovery-("wieder normal")-Nachricht an alle User, die dafür
// ihr Recovery-Toggle aktiviert haben - und nur, wenn die zu Ende gegangene
// Episode für sie lang genug war, dass ihr Alarm überhaupt ausgelöst hätte.
export async function notifyServerRecovery(
  serverId: string,
  event: NotificationEvent,
  payload: PushPayload,
  sinceBeforeClear: Date | null
) {
  if (!sinceBeforeClear) return;
  await ensureVapidKeys();
  const { users, prefByUser } = await loadUsersAndPrefs(serverId);
  if (users.length === 0) return;

  const delayField = DELAY_FIELDS[event];
  const recoveryField = RECOVERY_FIELDS[event];

  await Promise.all(
    users.map((u) => {
      const pref = prefByUser.get(u.id);
      const recoveryEnabled = pref ? Boolean(pref[recoveryField]) : false;
      if (!recoveryEnabled) return Promise.resolve();
      const delayMin = pref ? Number(pref[delayField] ?? 0) : 0;
      if (!shouldFireRecovery(sinceBeforeClear, delayMin)) return Promise.resolve();
      return sendPushToUser(u.id, payload);
    })
  );
}
