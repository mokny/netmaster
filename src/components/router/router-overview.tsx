"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { RouterDeviceDialog } from "@/components/router/router-device-dialog";
import { Trash2, RotateCcw, RefreshCw, Wifi, Router as RouterIcon } from "lucide-react";
import { useLiveEvents } from "@/hooks/use-live-events";
import type { RouterDeviceDTO, RouterHostEntry, RouterWifiNetwork } from "@/lib/types";

function formatUptime(sec: number | null): string {
  if (sec == null) return "-";
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function DeviceCard({
  device,
  onChanged,
}: {
  device: RouterDeviceDTO;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const hosts: RouterHostEntry[] = JSON.parse(device.connectedHostsJson || "[]");
  const wifi: RouterWifiNetwork[] = JSON.parse(device.wifiNetworksJson || "[]");
  const activeHosts = hosts.filter((h) => h.active);

  async function runAction(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    try {
      const res = await fetch(`/api/router-devices/${device.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Aktion fehlgeschlagen");
        return;
      }
      toast.success("Befehl gesendet");
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  async function deleteDevice() {
    const res = await fetch(`/api/router-devices/${device.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Löschen fehlgeschlagen");
      return;
    }
    onChanged();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <RouterIcon className="size-4 text-muted-foreground" />
          <div>
            <CardTitle className="text-base">{device.name}</CardTitle>
            <CardDescription>
              {device.type === "FRITZBOX" ? "FritzBox" : "FritzRepeater"} · {device.hostname}
            </CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={device.lastStatus} />
          <Button variant="ghost" size="icon" className="size-7" onClick={deleteDevice}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {device.lastError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {device.lastError}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Modell</p>
            <p className="truncate font-medium">{device.modelName ?? "-"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Firmware</p>
            <p className="truncate font-medium">{device.firmwareVersion ?? "-"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Laufzeit</p>
            <p className="font-medium">{formatUptime(device.uptimeSec)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Verbundene Geräte</p>
            <p className="font-medium">{activeHosts.length}</p>
          </div>
        </div>

        {device.wanConnectionStatus && (
          <div className="rounded-md border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">WAN-Verbindung</p>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={device.wanConnectionStatus === "Connected" ? "secondary" : "destructive"}>
                {device.wanConnectionStatus}
              </Badge>
              {device.wanExternalIp && (
                <span className="font-mono text-xs">{device.wanExternalIp}</span>
              )}
            </div>
          </div>
        )}

        {wifi.length > 0 && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wifi className="size-3.5" /> WLAN
            </p>
            {wifi.map((w) => (
              <div
                key={w.index}
                className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm"
              >
                <span className="truncate">{w.ssid || `Netz ${w.index}`}</span>
                <Switch
                  checked={w.enabled}
                  disabled={busy !== null}
                  onCheckedChange={(c) =>
                    runAction("wifi-toggle", { wifiIndex: w.index, enabled: !!c })
                  }
                />
              </div>
            ))}
          </div>
        )}

        {activeHosts.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Verbundene Geräte anzeigen
            </summary>
            <div className="mt-2 space-y-1">
              {activeHosts.map((h) => (
                <div
                  key={h.mac || h.ip}
                  className="flex items-center justify-between rounded-md border px-2 py-1 text-xs"
                >
                  <span className="truncate">{h.name || h.ip}</span>
                  <span className="font-mono text-muted-foreground">{h.ip}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => runAction("reboot")}
          >
            {busy === "reboot" ? (
              <RefreshCw className="size-3.5 animate-spin" />
            ) : (
              <RotateCcw className="size-3.5" />
            )}
            Neu starten
          </Button>
          {device.wanConnectionStatus && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => runAction("reconnect")}
            >
              {busy === "reconnect" ? (
                <RefreshCw className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Verbindung neu aufbauen
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function RouterOverview() {
  const [devices, setDevices] = useState<RouterDeviceDTO[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/router-devices");
    if (res.ok) setDevices((await res.json()).devices);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useLiveEvents((event) => {
    if (event.type !== "router-device") return;
    load();
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Router</h1>
          <p className="text-sm text-muted-foreground">FritzBox &amp; FritzRepeater</p>
        </div>
        <RouterDeviceDialog onSaved={load} />
      </div>

      {devices === null ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : devices.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Noch keine Router-Geräte hinzugefügt.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {devices.map((d) => (
            <DeviceCard key={d.id} device={d} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}
