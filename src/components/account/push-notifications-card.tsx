"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, BellOff, Loader2, Send, Trash2 } from "lucide-react";
import type { PushSubscriptionDTO, NotificationPreferenceDTO } from "@/lib/types";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type PrefKey = keyof Omit<NotificationPreferenceDTO, "serverId" | "serverName">;

const EVENT_LABELS: { key: PrefKey; label: string }[] = [
  { key: "offlineEnabled", label: "Offline" },
  { key: "dockerStoppedEnabled", label: "Docker gestoppt" },
];

// Pro Metrik zwei Spalten (Warnung/Kritisch), statt eines generischen
// Warning/Critical-Schalters für den gesamten Server-Status.
const METRIC_EVENT_LABELS: { warnKey: PrefKey; critKey: PrefKey; label: string }[] = [
  { warnKey: "cpuWarnEnabled", critKey: "cpuCritEnabled", label: "CPU" },
  { warnKey: "memWarnEnabled", critKey: "memCritEnabled", label: "RAM" },
  { warnKey: "diskWarnEnabled", critKey: "diskCritEnabled", label: "Disk" },
  { warnKey: "netWarnEnabled", critKey: "netCritEnabled", label: "Netzwerk" },
];

function pushSupported() {
  return (
    typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window
  );
}

export function PushNotificationsCard() {
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    pushSupported() ? Notification.permission : "default"
  );
  const [subscribedHere, setSubscribedHere] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [subscriptions, setSubscriptions] = useState<PushSubscriptionDTO[] | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferenceDTO[] | null>(null);

  const loadSubscriptions = useCallback(async () => {
    const res = await fetch("/api/push/subscribe");
    if (res.ok) setSubscriptions((await res.json()).subscriptions);
  }, []);

  const loadPrefs = useCallback(async () => {
    const res = await fetch("/api/account/notification-preferences");
    if (res.ok) setPrefs((await res.json()).servers);
  }, []);

  useEffect(() => {
    if (!pushSupported()) return;
    loadSubscriptions();
    loadPrefs();

    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setSubscribedHere(sub !== null);
    });
  }, [loadSubscriptions, loadPrefs]);

  async function enable() {
    if (!pushSupported()) {
      toast.error("Dieser Browser unterstützt keine Push-Benachrichtigungen");
      return;
    }
    setBusy(true);
    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== "granted") {
        toast.error("Benachrichtigungen wurden nicht erlaubt");
        return;
      }

      const keyRes = await fetch("/api/push/vapid-public-key");
      const { publicKey } = await keyRes.json();
      if (!publicKey) {
        toast.error("Push ist auf diesem Server nicht konfiguriert (VAPID-Schlüssel fehlt)");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        toast.error("Registrierung fehlgeschlagen");
        return;
      }

      setSubscribedHere(true);
      toast.success("Push-Benachrichtigungen aktiviert");
      loadSubscriptions();
    } catch {
      toast.error("Push-Benachrichtigungen konnten nicht aktiviert werden");
    } finally {
      setBusy(false);
    }
  }

  async function disableHere() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribedHere(false);
      toast.success("Push-Benachrichtigungen deaktiviert");
      loadSubscriptions();
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Test-Benachrichtigung fehlgeschlagen");
        return;
      }
      toast.success("Test-Benachrichtigung gesendet");
    } finally {
      setTesting(false);
    }
  }

  async function removeSubscription(id: string) {
    const res = await fetch(`/api/push/subscriptions/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Gerät entfernt");
      loadSubscriptions();
    } else {
      toast.error("Entfernen fehlgeschlagen");
    }
  }

  async function updatePref(serverId: string, patch: Partial<NotificationPreferenceDTO>) {
    if (!prefs) return;
    const current = prefs.find((p) => p.serverId === serverId);
    if (!current) return;
    const next = { ...current, ...patch };
    setPrefs(prefs.map((p) => (p.serverId === serverId ? next : p)));

    const res = await fetch("/api/account/notification-preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!res.ok) {
      toast.error("Speichern fehlgeschlagen");
      loadPrefs();
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Push-Benachrichtigungen</CardTitle>
          <CardDescription>
            Auf einem iPhone: Seite über &quot;Zum Home-Bildschirm&quot; installieren, bevor
            Push aktiviert werden kann.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {subscriptions && subscriptions.length > 0 && (
            <Button variant="outline" size="sm" onClick={sendTest} disabled={testing}>
              {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Test senden
            </Button>
          )}
          {subscribedHere ? (
            <Button variant="outline" size="sm" onClick={disableHere} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <BellOff className="size-4" />}
              Auf diesem Gerät deaktivieren
            </Button>
          ) : (
            <Button size="sm" onClick={enable} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />}
              Aktivieren
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {permission === "denied" && (
          <p className="text-sm text-red-500">
            Benachrichtigungen sind für diese Seite im Browser blockiert.
          </p>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">Registrierte Geräte</p>
          {subscriptions === null ? (
            <Skeleton className="h-10 w-full" />
          ) : subscriptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Geräte registriert.</p>
          ) : (
            <div className="space-y-1">
              {subscriptions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span className="truncate text-muted-foreground">
                    {s.userAgent || "Unbekanntes Gerät"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    onClick={() => removeSubscription(s.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Ereignisse pro Server</p>
          {prefs === null ? (
            <Skeleton className="h-24 w-full" />
          ) : prefs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Server vorhanden.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                    <th rowSpan={2} className="p-2 text-left font-medium align-bottom">
                      Server
                    </th>
                    {EVENT_LABELS.map((e) => (
                      <th key={e.key} rowSpan={2} className="p-2 text-center font-medium align-bottom">
                        {e.label}
                      </th>
                    ))}
                    {METRIC_EVENT_LABELS.map((m) => (
                      <th key={m.label} colSpan={2} className="p-2 text-center font-medium">
                        {m.label}
                      </th>
                    ))}
                  </tr>
                  <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                    {METRIC_EVENT_LABELS.map((m) => (
                      <Fragment key={m.label}>
                        <th className="p-2 text-center font-normal">Warnung</th>
                        <th className="p-2 text-center font-normal">Kritisch</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {prefs.map((p) => (
                    <tr key={p.serverId} className="border-b last:border-0">
                      <td className="p-2 font-medium">{p.serverName}</td>
                      {EVENT_LABELS.map((e) => (
                        <td key={e.key} className="p-2 text-center">
                          <Switch
                            checked={p[e.key]}
                            onCheckedChange={(c) => updatePref(p.serverId, { [e.key]: !!c })}
                          />
                        </td>
                      ))}
                      {METRIC_EVENT_LABELS.map((m) => (
                        <Fragment key={m.label}>
                          <td className="p-2 text-center">
                            <Switch
                              checked={p[m.warnKey]}
                              onCheckedChange={(c) => updatePref(p.serverId, { [m.warnKey]: !!c })}
                            />
                          </td>
                          <td className="p-2 text-center">
                            <Switch
                              checked={p[m.critKey]}
                              onCheckedChange={(c) => updatePref(p.serverId, { [m.critKey]: !!c })}
                            />
                          </td>
                        </Fragment>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
