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
import { Button, buttonVariants } from "@/components/ui/button";
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
import {
  Loader2,
  RefreshCw,
  Server as ServerIcon,
  Router as RouterIcon,
  Plus,
  Trash2,
  Terminal as TerminalIcon,
  Globe,
  FolderUp,
  X,
} from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { useTerminalManager } from "@/hooks/use-terminal-manager";
import { useLiveEvents, type LiveEvent } from "@/hooks/use-live-events";
import { ServerFormDialog } from "@/components/servers/server-form-dialog";
import { RouterDeviceDialog } from "@/components/router/router-device-dialog";
import { SshConnectDialog } from "@/components/explore/ssh-connect-dialog";

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

type RangeSource = "LAN_AUTO" | "VPN_AUTO" | "MANUAL";

interface RangeRef {
  source: RangeSource;
  interfaceName: string | null;
  cidr: string;
}

interface DiscoveredHostRow {
  id: string;
  ip: string;
  mac: string | null;
  hostname: string | null;
  vendor: string | null;
  openPorts: OpenPort[];
  osGuess: string | null;
  lastSeenOnline: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  matched: Matched | null;
  range: RangeRef | null;
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
  autoScanEnabled: boolean;
  autoScanIntervalHr: number;
  portScanConcurrency: number;
}

interface ExploreRangeDTO {
  id: string;
  cidr: string;
  source: RangeSource;
  interfaceName: string | null;
  enabled: boolean;
}

function rangeSourceLabel(source: RangeSource): string {
  if (source === "LAN_AUTO") return "LAN";
  if (source === "VPN_AUTO") return "VPN";
  return "Manuell";
}

interface HostConnections {
  ssh: { port: number } | null;
  ftp: { port: number } | null;
  web: { url: string; label: string }[];
}

// Leitet aus den gescannten offenen Ports/Services her, welche Verbindungen
// direkt anbietbar sind - basierend auf dem von nmap erkannten Service-
// Namen, mit den Standardports als Fallback.
function detectConnections(ports: OpenPort[], ip: string): HostConnections {
  let ssh: HostConnections["ssh"] = null;
  let ftp: HostConnections["ftp"] = null;
  const web: HostConnections["web"] = [];

  for (const p of ports) {
    const svc = p.service.toLowerCase();
    if (!ssh && (svc === "ssh" || p.port === 22)) {
      ssh = { port: p.port };
      continue;
    }
    if (!ftp && (svc === "ftp" || p.port === 21)) {
      ftp = { port: p.port };
      continue;
    }
    const isHttps = svc.includes("ssl") || svc === "https" || p.port === 443 || p.port === 8443;
    const isHttp = !isHttps && (svc.includes("http") || p.port === 80 || p.port === 8080);
    if (isHttps) {
      web.push({ url: `https://${ip}${p.port === 443 ? "" : `:${p.port}`}`, label: "HTTPS" });
    } else if (isHttp) {
      web.push({ url: `http://${ip}${p.port === 80 ? "" : `:${p.port}`}`, label: "HTTP" });
    }
  }

  return { ssh, ftp, web };
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("de-DE");
}

export function ExploreOverview() {
  const session = useSession();
  const canScan = session?.role === "EDITOR" || session?.role === "ADMIN";
  const { openTerminal } = useTerminalManager();

  const [hosts, setHosts] = useState<DiscoveredHostRow[] | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatusDTO | null>(null);
  const [settings, setSettings] = useState<ExploreSettingsDTO | null>(null);
  const [ranges, setRanges] = useState<ExploreRangeDTO[] | null>(null);
  const [newRangeInput, setNewRangeInput] = useState("");
  const [addingRange, setAddingRange] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [addServerHost, setAddServerHost] = useState<DiscoveredHostRow | null>(null);
  const [addRouterHost, setAddRouterHost] = useState<DiscoveredHostRow | null>(null);
  const [sshDialogTarget, setSshDialogTarget] = useState<{ ip: string; port: number } | null>(
    null
  );

  function connectSsh(host: DiscoveredHostRow, port: number) {
    if (host.matched?.kind === "server") {
      openTerminal(host.matched.id, host.matched.name);
      return;
    }
    setSshDialogTarget({ ip: host.ip, port });
  }

  const loadHosts = useCallback(async () => {
    const res = await fetch("/api/explore/hosts");
    if (res.ok) setHosts((await res.json()).hosts);
  }, []);

  const loadRanges = useCallback(async () => {
    const res = await fetch("/api/explore/ranges");
    if (res.ok) setRanges((await res.json()).ranges);
  }, []);

  // Initialer Ladezustand - danach übernehmen die Live-Events unten alle
  // weiteren Aktualisierungen (auch von Scans, die eine andere Session oder
  // der automatische Hintergrund-Scan ausgelöst hat).
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/explore/hosts").then((res) => (res.ok ? res.json() : { hosts: [] })),
      fetch("/api/explore/settings").then((res) => (res.ok ? res.json() : { settings: null })),
      fetch("/api/explore/ranges").then((res) => (res.ok ? res.json() : { ranges: [] })),
      fetch("/api/explore/scan/status").then((res) => (res.ok ? res.json() : null)),
    ]).then(([hostsData, settingsData, rangesData, statusData]) => {
      if (!active) return;
      setHosts(hostsData.hosts);
      if (settingsData.settings) setSettings(settingsData.settings);
      setRanges(rangesData.ranges);
      if (statusData) setScanStatus(statusData);
    });
    return () => {
      active = false;
    };
  }, []);

  // Live-Updates über den bestehenden WebSocket-Event-Bus (/api/ws), statt
  // die Liste zu pollen: Scan-Fortschritt kommt bei jedem Statuswechsel,
  // die Hostliste/Range-Liste aktualisiert sich, sobald sich am Server etwas
  // geändert hat (eigener Scan, Scan aus einer anderen Session, automatischer
  // Hintergrund-Scan, VPN-Interface kommt/geht).
  const handleLiveEvent = useCallback(
    (event: LiveEvent) => {
      if (event.type === "explore-scan") {
        setScanStatus({
          status: event.status,
          startedAt: event.startedAt,
          progress: event.progress,
          error: event.error,
          lastCompletedAt: event.lastCompletedAt,
        });
      } else if (event.type === "explore-hosts") {
        loadHosts();
      } else if (event.type === "explore-ranges") {
        loadRanges();
      }
    },
    [loadHosts, loadRanges]
  );
  useLiveEvents(handleLiveEvent);

  async function startScan() {
    const res = await fetch("/api/explore/scan", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Scan konnte nicht gestartet werden");
      return;
    }
    setScanStatus({ status: "running", startedAt: new Date().toISOString(), progress: null, error: null, lastCompletedAt: null });
  }

  const [aborting, setAborting] = useState(false);

  async function abortRunningScan() {
    setAborting(true);
    try {
      const res = await fetch("/api/explore/scan/abort", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Abbruch fehlgeschlagen");
        return;
      }
      toast.success("Scan wird abgebrochen…");
    } finally {
      setAborting(false);
    }
  }

  const [clearingHosts, setClearingHosts] = useState(false);

  async function clearHosts() {
    if (!window.confirm("Alle gefundenen Geräte aus der Liste entfernen?")) return;
    setClearingHosts(true);
    try {
      const res = await fetch("/api/explore/hosts", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Liste konnte nicht geleert werden");
        return;
      }
      setHosts([]);
      toast.success("Liste geleert");
    } finally {
      setClearingHosts(false);
    }
  }

  async function saveSettings() {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const res = await fetch("/api/explore/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoScanEnabled: settings.autoScanEnabled,
          autoScanIntervalHr: settings.autoScanIntervalHr,
          portScanConcurrency: settings.portScanConcurrency,
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

  async function addRange() {
    const cidr = newRangeInput.trim();
    if (!cidr) return;
    setAddingRange(true);
    try {
      const res = await fetch("/api/explore/ranges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cidr }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Range konnte nicht angelegt werden");
        return;
      }
      setNewRangeInput("");
      await loadRanges();
    } finally {
      setAddingRange(false);
    }
  }

  async function toggleRange(id: string, enabled: boolean) {
    const res = await fetch(`/api/explore/ranges/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Speichern fehlgeschlagen");
      return;
    }
    setRanges((prev) => prev?.map((r) => (r.id === id ? data.range : r)) ?? prev);
  }

  async function deleteRange(id: string) {
    if (!window.confirm("Diese manuelle Range wirklich entfernen?")) return;
    const res = await fetch(`/api/explore/ranges/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Löschen fehlgeschlagen");
      return;
    }
    setRanges((prev) => prev?.filter((r) => r.id !== id) ?? prev);
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
          <div className="flex gap-2">
            {scanning && (
              <Button variant="outline" onClick={abortRunningScan} disabled={aborting}>
                {aborting ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                Abbrechen
              </Button>
            )}
            <Button onClick={startScan} disabled={scanning}>
              {scanning ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Scan starten
            </Button>
          </div>
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
            <CardTitle className="text-base">Scan-Ranges</CardTitle>
            <CardDescription>
              LAN- und VPN-Interfaces des Hosts werden automatisch erkannt (alle 15s
              abgeglichen). Manuelle Ranges können frei hinzugefügt werden.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {ranges === null ? (
              <Skeleton className="h-20 w-full" />
            ) : ranges.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Keine Range erkannt oder konfiguriert.
              </p>
            ) : (
              <div className="space-y-2">
                {ranges.map((range) => (
                  <div
                    key={range.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant={range.source === "MANUAL" ? "outline" : "secondary"}>
                        {rangeSourceLabel(range.source)}
                      </Badge>
                      <span className="font-mono text-sm">{range.cidr}</span>
                      {range.interfaceName && (
                        <span className="text-xs text-muted-foreground">
                          ({range.interfaceName})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={range.enabled}
                        onCheckedChange={(c) => toggleRange(range.id, !!c)}
                      />
                      {range.source === "MANUAL" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => deleteRange(range.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label>Manuelle Range hinzufügen (CIDR)</Label>
                <Input
                  value={newRangeInput}
                  onChange={(e) => setNewRangeInput(e.target.value)}
                  placeholder="192.168.1.0/24"
                />
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={addRange} disabled={addingRange}>
                  {addingRange ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  Hinzufügen
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

            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label>Gleichzeitige Port-Scans</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={settings?.portScanConcurrency ?? 5}
                  onChange={(e) =>
                    setSettings((s) => (s ? { ...s, portScanConcurrency: Number(e.target.value) } : s))
                  }
                />
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={saveSettings} disabled={savingSettings}>
                  {savingSettings && <Loader2 className="size-4 animate-spin" />}
                  Speichern
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {canScan && hosts !== null && hosts.length > 0 && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={clearHosts}
            disabled={clearingHosts || scanning}
          >
            {clearingHosts ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-3.5" />}
            Liste leeren
          </Button>
        </div>
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
                  <TableHead>Quelle</TableHead>
                  <TableHead>Verbindung</TableHead>
                  <TableHead>Offene Ports</TableHead>
                  <TableHead>Zuletzt gesehen</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hosts.map((host) => {
                  const connections = detectConnections(host.openPorts, host.ip);
                  return (
                  <TableRow key={host.id}>
                    <TableCell className="font-mono">{host.ip}</TableCell>
                    <TableCell>{host.hostname ?? "-"}</TableCell>
                    <TableCell>{host.vendor ?? "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{host.mac ?? "-"}</TableCell>
                    <TableCell>
                      {host.range ? (
                        <Badge variant={host.range.source === "MANUAL" ? "outline" : "secondary"}>
                          {rangeSourceLabel(host.range.source)}
                          {host.range.interfaceName && ` (${host.range.interfaceName})`}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {connections.ssh && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            title={`SSH (Port ${connections.ssh.port})`}
                            onClick={() => connectSsh(host, connections.ssh!.port)}
                          >
                            <TerminalIcon className="size-3.5" />
                          </Button>
                        )}
                        {connections.web.map((w) => (
                          <a
                            key={w.url}
                            href={w.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            title={w.label}
                            className={buttonVariants({ variant: "ghost", size: "icon", className: "size-7" })}
                          >
                            <Globe className="size-3.5" />
                          </a>
                        ))}
                        {connections.ftp && (
                          <a
                            href={`ftp://${host.ip}:${connections.ftp.port}`}
                            title={`FTP (Port ${connections.ftp.port})`}
                            className={buttonVariants({ variant: "ghost", size: "icon", className: "size-7" })}
                          >
                            <FolderUp className="size-3.5" />
                          </a>
                        )}
                        {!connections.ssh && connections.web.length === 0 && !connections.ftp && (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </div>
                    </TableCell>
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
                  );
                })}
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
      {sshDialogTarget && (
        <SshConnectDialog
          host={sshDialogTarget.ip}
          port={sshDialogTarget.port}
          open={sshDialogTarget !== null}
          onOpenChange={(open) => !open && setSshDialogTarget(null)}
        />
      )}
    </div>
  );
}
