"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Loader2, RefreshCw, Server as ServerIcon, Router as RouterIcon } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { ServerFormDialog } from "@/components/servers/server-form-dialog";
import { RouterDeviceDialog } from "@/components/router/router-device-dialog";

const STATUS_POLL_MS = 3_000;

interface OpenPort {
  port: number;
  service: string;
  version: string;
}

interface Matched {
  kind: "server" | "router";
  id: string;
  name: string;
}

interface DiscoveredHostRow {
  id: string;
  ip: string;
  mac: string;
  hostname: string | null;
  vendor: string | null;
  openPorts: OpenPort[];
  osGuess: string | null;
  lastSeenOnline: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  matched: Matched | null;
}

interface ScanStatusDTO {
  status: "idle" | "running" | "error";
  startedAt: string | null;
  progress: { phase: "hosts" | "ports"; current: number; total: number } | null;
  error: string | null;
  lastCompletedAt: string | null;
}

interface ExploreSettingsDTO {
  id: string;
  scanRangeOverride: string | null;
  autoScanEnabled: boolean;
  autoScanIntervalHr: number;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("de-DE");
}

export function ExploreOverview() {
  const session = useSession();
  const canScan = session?.role === "EDITOR" || session?.role === "ADMIN";

  const [hosts, setHosts] = useState<DiscoveredHostRow[] | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatusDTO | null>(null);
  const [settings, setSettings] = useState<ExploreSettingsDTO | null>(null);
  const [detectedRange, setDetectedRange] = useState<string | null>(null);
  const [rangeInput, setRangeInput] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const [addServerHost, setAddServerHost] = useState<DiscoveredHostRow | null>(null);
  const [addRouterHost, setAddRouterHost] = useState<DiscoveredHostRow | null>(null);

  const loadHosts = useCallback(async () => {
    const res = await fetch("/api/explore/hosts");
    if (res.ok) setHosts((await res.json()).hosts);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/explore/hosts").then((res) => (res.ok ? res.json() : { hosts: [] })),
      fetch("/api/explore/settings").then((res) =>
        res.ok ? res.json() : { settings: null, detectedRange: null }
      ),
    ]).then(([hostsData, settingsData]) => {
      if (!active) return;
      setHosts(hostsData.hosts);
      if (settingsData.settings) {
        setSettings(settingsData.settings);
        setDetectedRange(settingsData.detectedRange);
        setRangeInput(settingsData.settings.scanRangeOverride ?? "");
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Scan-Fortschritt pollen, solange ein Scan läuft (auch wenn er von einer
  // anderen Session/Ansicht gestartet wurde oder nach Reload noch läuft).
  useEffect(() => {
    let stopped = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function pollOnce() {
      const res = await fetch("/api/explore/scan/status");
      if (stopped || !res.ok) return;
      const data: ScanStatusDTO = await res.json();
      setScanStatus(data);
      if (data.status !== "running" && interval) {
        clearInterval(interval);
        interval = null;
        loadHosts();
      }
    }

    pollOnce().then(() => {
      if (stopped) return;
      interval = setInterval(pollOnce, STATUS_POLL_MS);
    });

    return () => {
      stopped = true;
      if (interval) clearInterval(interval);
    };
  }, [loadHosts]);

  async function startScan() {
    const res = await fetch("/api/explore/scan", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Scan konnte nicht gestartet werden");
      return;
    }
    setScanStatus({ status: "running", startedAt: new Date().toISOString(), progress: null, error: null, lastCompletedAt: null });
  }

  async function saveSettings() {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/explore/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scanRangeOverride: rangeInput.trim() || null,
          autoScanEnabled: settings?.autoScanEnabled ?? false,
          autoScanIntervalHr: settings?.autoScanIntervalHr ?? 24,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Speichern fehlgeschlagen");
        return;
      }
      setSettings(data.settings);
      toast.success("Einstellungen gespeichert");
    } finally {
      setSavingSettings(false);
    }
  }

  async function toggleAutoScan(enabled: boolean) {
    if (!settings) return;
    const res = await fetch("/api/explore/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoScanEnabled: enabled }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Speichern fehlgeschlagen");
      return;
    }
    setSettings(data.settings);
  }

  const scanning = scanStatus?.status === "running";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Explore</h1>
          <p className="text-sm text-muted-foreground">
            Netzwerk-Scan: findet Geräte im LAN und ihre offenen Dienste
          </p>
        </div>
        {canScan && (
          <Button onClick={startScan} disabled={scanning}>
            {scanning ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Scan starten
          </Button>
        )}
      </div>

      {scanning && (
        <Card>
          <CardContent className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {scanStatus?.progress?.phase === "ports"
              ? `Scanne Dienste... (${scanStatus.progress.current}/${scanStatus.progress.total})`
              : "Suche Geräte im Netzwerk..."}
          </CardContent>
        </Card>
      )}

      {scanStatus?.status === "error" && scanStatus.error && (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">
            Scan fehlgeschlagen: {scanStatus.error}
          </CardContent>
        </Card>
      )}

      {canScan && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scan-Einstellungen</CardTitle>
            <CardDescription>
              {detectedRange
                ? `Automatisch erkannt: ${detectedRange}`
                : "Konnte keine Netzwerk-Range automatisch erkennen"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label>Scan-Range überschreiben (CIDR)</Label>
                <Input
                  value={rangeInput}
                  onChange={(e) => setRangeInput(e.target.value)}
                  placeholder={detectedRange ?? "192.168.1.0/24"}
                />
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={saveSettings} disabled={savingSettings}>
                  {savingSettings && <Loader2 className="size-4 animate-spin" />}
                  Speichern
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <Label className="font-normal">Automatischer Scan</Label>
                <p className="text-xs text-muted-foreground">
                  Alle {settings?.autoScanIntervalHr ?? 24} Stunden im Hintergrund
                </p>
              </div>
              <Switch
                checked={settings?.autoScanEnabled ?? false}
                onCheckedChange={(c) => toggleAutoScan(!!c)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {hosts === null ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : hosts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Noch keine Geräte gefunden. {canScan && "Starte einen Scan, um das Netzwerk zu durchsuchen."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IP</TableHead>
                  <TableHead>Hostname</TableHead>
                  <TableHead>Hersteller</TableHead>
                  <TableHead>MAC</TableHead>
                  <TableHead>Offene Ports</TableHead>
                  <TableHead>Zuletzt gesehen</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hosts.map((host) => (
                  <TableRow key={host.id}>
                    <TableCell className="font-mono">{host.ip}</TableCell>
                    <TableCell>{host.hostname ?? "-"}</TableCell>
                    <TableCell>{host.vendor ?? "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{host.mac}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {host.openPorts.length === 0 && (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                        {host.openPorts.map((p) => (
                          <Badge key={p.port} variant="secondary" className="font-mono text-xs">
                            {p.port}
                            {p.service && `/${p.service}`}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(host.lastSeenAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={host.lastSeenOnline ? "secondary" : "outline"}>
                        {host.lastSeenOnline ? "online" : "nicht mehr online"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {host.matched ? (
                        <Badge variant="outline">
                          Bereits hinzugefügt ({host.matched.kind === "server" ? "Server" : "Router"})
                        </Badge>
                      ) : canScan ? (
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setAddServerHost(host)}
                          >
                            <ServerIcon className="size-3.5" />
                            Server
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setAddRouterHost(host)}
                          >
                            <RouterIcon className="size-3.5" />
                            Router
                          </Button>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <ServerFormDialog
        open={addServerHost !== null}
        onOpenChange={(open) => !open && setAddServerHost(null)}
        initialHostname={addServerHost?.ip}
        onSaved={() => {
          setAddServerHost(null);
          loadHosts();
        }}
      />
      <RouterDeviceDialog
        open={addRouterHost !== null}
        onOpenChange={(open) => !open && setAddRouterHost(null)}
        initial={{ hostname: addRouterHost?.ip }}
        onSaved={() => {
          setAddRouterHost(null);
          loadHosts();
        }}
      />
    </div>
  );
}
