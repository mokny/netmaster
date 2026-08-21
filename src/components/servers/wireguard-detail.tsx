"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useSession } from "@/hooks/use-session";
import {
  ArrowLeft,
  Loader2,
  Plus,
  RotateCw,
  Play,
  Square,
  Trash2,
  Download,
  Network,
  RefreshCw,
} from "lucide-react";
import type { ServerDTO } from "@/lib/types";

interface WgPeer {
  name: string;
  publicKey: string;
  presharedKey?: string;
  allowedIps: string;
  endpoint?: string;
  persistentKeepalive?: number;
}

interface WgInterfaceConfig {
  name: string;
  address?: string;
  listenPort?: number;
  dns?: string;
  mtu?: number;
  postUp?: string;
  postDown?: string;
  peers: WgPeer[];
}

interface WgPeerStatus {
  publicKey: string;
  endpoint: string | null;
  allowedIps: string;
  latestHandshake: number;
  transferRx: number;
  transferTx: number;
  persistentKeepalive: string;
}

interface WgInterfaceStatus {
  name: string;
  up: boolean;
  enabled: boolean;
  listenPort: number | null;
  publicKey: string | null;
  peers: WgPeerStatus[];
}

interface IfaceDetail {
  config: WgInterfaceConfig;
  publicKey: string | null;
  raw: string;
  status: WgInterfaceStatus;
}

function formatBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

function formatHandshake(ts: number): string {
  if (!ts) return "nie";
  const diffSec = Math.max(0, Date.now() / 1000 - ts);
  if (diffSec < 60) return "gerade eben";
  if (diffSec < 3600) return `vor ${Math.round(diffSec / 60)} Min.`;
  if (diffSec < 86400) return `vor ${Math.round(diffSec / 3600)} Std.`;
  return `vor ${Math.round(diffSec / 86400)} Tagen`;
}

export function WireguardDetail({ serverId }: { serverId: string }) {
  const session = useSession();
  const confirm = useConfirm();
  const canEdit = session?.role === "EDITOR" || session?.role === "ADMIN";

  const [server, setServer] = useState<ServerDTO | null>(null);
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [interfaces, setInterfaces] = useState<string[]>([]);
  const [detail, setDetail] = useState<IfaceDetail | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadList = useCallback(async () => {
    const res = await fetch(`/api/servers/${serverId}/wireguard`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setInstalled(data.installed);
      setInterfaces(data.interfaces ?? []);
      if (data.interfaces?.length && !selected) {
        setSelected(data.interfaces[0]);
      }
    } else {
      toast.error(data.error ?? "Fehler beim Laden");
    }
  }, [serverId, selected]);

  const loadDetail = useCallback(async (name: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/wireguard/${encodeURIComponent(name)}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDetail(data);
      } else {
        toast.error(data.error ?? "Fehler beim Laden des Interfaces");
      }
    } finally {
      setLoadingDetail(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetch(`/api/servers/${serverId}`)
      .then((res) => res.json())
      .then((data) => setServer(data.server))
      .catch(() => {});
  }, [serverId]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (selected) loadDetail(selected);
    else setDetail(null);
  }, [selected, loadDetail]);

  async function install() {
    setInstalling(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/wireguard/install`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Installation fehlgeschlagen");
        return;
      }
      toast.success("WireGuard wurde installiert");
      await loadList();
    } catch {
      toast.error("Verbindung fehlgeschlagen");
    } finally {
      setInstalling(false);
    }
  }

  async function deleteIface(name: string) {
    if (
      !(await confirm({
        title: "Interface löschen",
        description: `Interface "${name}" wird gestoppt, deaktiviert und die Konfigurationsdatei gelöscht. Fortfahren?`,
        confirmText: "Löschen",
        variant: "destructive",
      }))
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/wireguard/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Löschen fehlgeschlagen");
        return;
      }
      toast.success("Interface gelöscht");
      setSelected(null);
      setDetail(null);
      await loadList();
    } finally {
      setBusy(false);
    }
  }

  async function control(name: string, action: "start" | "stop" | "restart" | "enable" | "disable") {
    setBusy(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/wireguard/${encodeURIComponent(name)}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? `${action} fehlgeschlagen`);
        return;
      }
      toast.success(`${name}: ${action} ausgeführt`);
      await loadDetail(name);
    } finally {
      setBusy(false);
    }
  }

  if (!server) {
    return <p className="text-sm text-muted-foreground">Lade…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/servers/${serverId}`}
          className={buttonVariants({ variant: "ghost", size: "icon" })}
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">WireGuard – {server.name}</h1>
          <p className="text-sm text-muted-foreground">{server.hostname}</p>
        </div>
      </div>

      {installed === false && (
        <Card>
          <CardHeader>
            <CardTitle>WireGuard nicht installiert</CardTitle>
            <CardDescription>
              Auf diesem Server wurde WireGuard (wg/wg-quick) nicht gefunden.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {canEdit ? (
              <Button onClick={install} disabled={installing}>
                {installing && <Loader2 className="size-4 animate-spin" />}
                WireGuard installieren
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Keine Berechtigung zur Installation.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {installed && (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <Card className="h-fit">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Interfaces</CardTitle>
              {canEdit && (
                <CreateInterfaceDialog
                  serverId={serverId}
                  networkToolsEnabled={server.networkToolsEnabled}
                  onCreated={async () => {
                    await loadList();
                  }}
                />
              )}
            </CardHeader>
            <CardContent className="space-y-1">
              {interfaces.length === 0 && (
                <p className="text-sm text-muted-foreground">Keine Interfaces angelegt.</p>
              )}
              {interfaces.map((name) => (
                <button
                  key={name}
                  onClick={() => setSelected(name)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${
                    selected === name ? "bg-accent font-medium" : ""
                  }`}
                >
                  <Network className="size-3.5 text-muted-foreground" />
                  {name}
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {loadingDetail && <Skeleton />}
            {!loadingDetail && detail && (
              <InterfacePanel
                serverId={serverId}
                canEdit={canEdit}
                busy={busy}
                detail={detail}
                onRefresh={() => selected && loadDetail(selected)}
                onControl={(action) => selected && control(selected, action)}
                onDelete={() => selected && deleteIface(selected)}
              />
            )}
            {!loadingDetail && !detail && interfaces.length > 0 && (
              <p className="text-sm text-muted-foreground">Interface wählen…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return <div className="h-48 w-full animate-pulse rounded-md bg-muted" />;
}

function InterfacePanel({
  serverId,
  canEdit,
  busy,
  detail,
  onRefresh,
  onControl,
  onDelete,
}: {
  serverId: string;
  canEdit: boolean;
  busy: boolean;
  detail: IfaceDetail;
  onRefresh: () => void;
  onControl: (action: "start" | "stop" | "restart" | "enable" | "disable") => void;
  onDelete: () => void;
}) {
  const { config, status, publicKey, raw } = detail;
  const statusByKey = new Map(status.peers.map((p) => [p.publicKey, p]));

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              {config.name}
              <Badge variant={status.up ? "default" : "secondary"}>
                {status.up ? "aktiv" : "inaktiv"}
              </Badge>
              <Badge variant="outline">{status.enabled ? "Autostart an" : "Autostart aus"}</Badge>
            </CardTitle>
            <CardDescription>
              {config.address ?? "–"} · Port {status.listenPort ?? config.listenPort ?? "–"}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCw className="size-4" />
              Aktualisieren
            </Button>
            {canEdit && (
              <>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => onControl("start")}>
                  <Play className="size-4" />
                  Start
                </Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => onControl("stop")}>
                  <Square className="size-4" />
                  Stop
                </Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => onControl("restart")}>
                  <RotateCw className="size-4" />
                  Neustart
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => onControl(status.enabled ? "disable" : "enable")}
                >
                  {status.enabled ? "Autostart aus" : "Autostart an"}
                </Button>
                <Button variant="destructive" size="sm" disabled={busy} onClick={onDelete}>
                  <Trash2 className="size-4" />
                  Löschen
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <p className="break-all text-xs text-muted-foreground">
            PublicKey: <span className="font-mono">{publicKey ?? "–"}</span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Tabs defaultValue="peers">
            <TabsList>
              <TabsTrigger value="peers">Peers</TabsTrigger>
              <TabsTrigger value="form">Formular</TabsTrigger>
              <TabsTrigger value="raw">Config (roh)</TabsTrigger>
            </TabsList>

            <TabsContent value="peers" className="space-y-4 pt-4">
              <div className="flex flex-wrap justify-end gap-2">
                {canEdit && (
                  <LinkServerDialog
                    serverId={serverId}
                    iface={config.name}
                    onLinked={onRefresh}
                  />
                )}
                {canEdit && (
                  <AddPeerDialog
                    serverId={serverId}
                    iface={config.name}
                    onAdded={onRefresh}
                  />
                )}
                {canEdit && (
                  <BulkPeersDialog serverId={serverId} iface={config.name} onAdded={onRefresh} />
                )}
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>AllowedIPs</TableHead>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Handshake</TableHead>
                      <TableHead>Transfer</TableHead>
                      {canEdit && <TableHead className="w-8" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {config.peers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-sm text-muted-foreground">
                          Keine Peers.
                        </TableCell>
                      </TableRow>
                    ) : (
                      config.peers.map((peer) => {
                        const live = statusByKey.get(peer.publicKey);
                        return (
                          <TableRow key={peer.publicKey}>
                            <TableCell>
                              <div className="font-medium">{peer.name || "(unbenannt)"}</div>
                              <div className="font-mono text-xs text-muted-foreground">
                                {peer.publicKey.slice(0, 16)}…
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{peer.allowedIps}</TableCell>
                            <TableCell className="font-mono text-xs">
                              {live?.endpoint ?? peer.endpoint ?? "–"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {live ? formatHandshake(live.latestHandshake) : "–"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {live ? `↓${formatBytes(live.transferRx)} ↑${formatBytes(live.transferTx)}` : "–"}
                            </TableCell>
                            {canEdit && (
                              <TableCell>
                                <RemovePeerButton
                                  serverId={serverId}
                                  iface={config.name}
                                  peer={peer}
                                  onRemoved={onRefresh}
                                />
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="form" className="space-y-3 pt-4">
              <p className="text-sm text-muted-foreground">
                Grundlegende Interface-Einstellungen. Änderungen werden über die
                Roh-Config-Ansicht gespeichert.
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">Address</Label>
                  <p className="font-mono">{config.address ?? "–"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">ListenPort</Label>
                  <p className="font-mono">{config.listenPort ?? "–"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">DNS</Label>
                  <p className="font-mono">{config.dns ?? "–"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">MTU</Label>
                  <p className="font-mono">{config.mtu ?? "–"}</p>
                </div>
                {(config.postUp || config.postDown) && (
                  <div className="col-span-2">
                    <Label className="text-xs text-muted-foreground">
                      NAT/Forwarding (PostUp/PostDown) aktiv
                    </Label>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Für Detailänderungen an einzelnen Feldern die Roh-Config bearbeiten.
              </p>
            </TabsContent>

            <TabsContent value="raw" className="pt-4">
              <RawEditor serverId={serverId} iface={config.name} raw={raw} canEdit={canEdit} onSaved={onRefresh} />
            </TabsContent>
          </Tabs>
        </CardHeader>
      </Card>
    </>
  );
}

function RawEditor({
  serverId,
  iface,
  raw,
  canEdit,
  onSaved,
}: {
  serverId: string;
  iface: string;
  raw: string;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [text, setText] = useState(raw);
  const [saving, setSaving] = useState(false);

  useEffect(() => setText(raw), [raw]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/wireguard/${encodeURIComponent(iface)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Speichern fehlgeschlagen");
        return;
      }
      toast.success("Config gespeichert. Zum Anwenden ggf. Neustart ausführen.");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Vor dem Schreiben wird die Syntax geprüft (wg-quick strip) und die vorherige
        Version als .bak gesichert. Änderungen werden nicht automatisch angewendet –
        dazu im Tab &quot;Peers&quot; oben auf &quot;Neustart&quot; klicken.
      </p>
      <textarea
        className="min-h-64 w-full rounded-md border bg-transparent p-2 font-mono text-xs shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={!canEdit}
      />
      {canEdit && (
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Speichern
        </Button>
      )}
    </div>
  );
}

function CreateInterfaceDialog({
  serverId,
  networkToolsEnabled,
  onCreated,
}: {
  serverId: string;
  networkToolsEnabled: boolean;
  onCreated: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [natOpen, setNatOpen] = useState(false);
  const [netInfo, setNetInfo] = useState<{ defaultIface: string | null; interfaces: string[] } | null>(null);
  const [form, setForm] = useState({
    name: "wg0",
    address: "10.10.0.1/24",
    listenPort: 51820,
    dns: "",
    mtu: "",
    natEnabled: false,
    egressIface: "",
  });

  useEffect(() => {
    if (open && natOpen && !netInfo) {
      fetch(`/api/servers/${serverId}/wireguard/netinfo`)
        .then((res) => res.json())
        .then((data) => {
          setNetInfo(data);
          setForm((f) => ({ ...f, egressIface: data.defaultIface ?? f.egressIface }));
        })
        .catch(() => {});
    }
  }, [open, natOpen, netInfo, serverId]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/wireguard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          address: form.address,
          listenPort: Number(form.listenPort),
          dns: form.dns || undefined,
          mtu: form.mtu ? Number(form.mtu) : undefined,
          nat: form.natEnabled && form.egressIface ? { egressIface: form.egressIface } : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Anlegen fehlgeschlagen");
        return;
      }
      toast.success("Interface angelegt");
      setOpen(false);
      await onCreated();

      if (networkToolsEnabled) {
        const wantsRule = await confirm({
          title: "Firewall-Regel anlegen?",
          description: `Soll UDP-Port ${form.listenPort} in der Firewall freigegeben werden?`,
          confirmText: "Freigeben",
          cancelText: "Nein",
        });
        if (wantsRule) {
          const fwRes = await fetch(`/api/servers/${serverId}/firewall/rules`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "allow", protocol: "udp", port: Number(form.listenPort) }),
          });
          if (fwRes.ok) toast.success("Firewall-Regel angelegt");
          else toast.error("Firewall-Regel konnte nicht angelegt werden");
        }
      }
    } catch {
      toast.error("Verbindung fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="size-4" />
            Neu
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neues WireGuard-Interface</DialogTitle>
          <DialogDescription>Schlüsselpaar wird automatisch erzeugt.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>ListenPort</Label>
              <Input
                type="number"
                value={form.listenPort}
                onChange={(e) => set("listenPort", Number(e.target.value))}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>DNS (optional)</Label>
              <Input value={form.dns} onChange={(e) => set("dns", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>MTU (optional)</Label>
              <Input value={form.mtu} onChange={(e) => set("mtu", e.target.value)} />
            </div>
          </div>

          <details
            className="rounded-md border p-3 text-sm"
            open={natOpen}
            onToggle={(e) => setNatOpen((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer font-medium">Erweitert</summary>
            <div className="mt-3 flex items-center justify-between">
              <div>
                <Label htmlFor="nat-enabled">Gateway/Exit-Node aktivieren</Label>
                <p className="text-xs text-muted-foreground">
                  IP-Forwarding + NAT-Masquerade über das ausgehende Interface
                </p>
              </div>
              <Switch id="nat-enabled" checked={form.natEnabled} onCheckedChange={(c) => set("natEnabled", !!c)} />
            </div>
            {form.natEnabled && (
              <div className="mt-2 space-y-2">
                <Label className="text-xs">Ausgehendes Interface</Label>
                <Select value={form.egressIface} onValueChange={(v) => set("egressIface", v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={netInfo?.defaultIface ?? "wählen…"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(netInfo?.interfaces ?? []).map((i) => (
                      <SelectItem key={i} value={i}>
                        {i}
                        {i === netInfo?.defaultIface ? " (erkannt)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </details>

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              Anlegen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddPeerDialog({
  serverId,
  iface,
  onAdded,
}: {
  serverId: string;
  iface: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ peerConfig: string; qr: string } | null>(null);
  const [form, setForm] = useState({
    name: "",
    clientAddress: "",
    allowedIps: "0.0.0.0/0, ::/0",
    endpoint: "",
    persistentKeepalive: "",
    usePsk: true,
    clientDns: "",
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/wireguard/${encodeURIComponent(iface)}/peers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          clientAddress: form.clientAddress,
          allowedIps: form.allowedIps,
          endpoint: form.endpoint || undefined,
          persistentKeepalive: form.persistentKeepalive ? Number(form.persistentKeepalive) : undefined,
          usePsk: form.usePsk,
          clientDns: form.clientDns || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Peer konnte nicht angelegt werden");
        return;
      }
      const qr = await QRCode.toDataURL(data.peerConfig, { margin: 1, width: 256 });
      setResult({ peerConfig: data.peerConfig, qr });
      onAdded();
    } catch {
      toast.error("Verbindung fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  function downloadConfig() {
    if (!result) return;
    const blob = new Blob([result.peerConfig], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form.name || "peer"}.conf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setResult(null);
          setForm({
            name: "",
            clientAddress: "",
            allowedIps: "0.0.0.0/0, ::/0",
            endpoint: "",
            persistentKeepalive: "",
            usePsk: true,
            clientDns: "",
          });
        }
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Plus className="size-4" />
            Peer hinzufügen
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Peer hinzufügen</DialogTitle>
          <DialogDescription>
            Schlüsselpaar wird erzeugt und nur einmalig angezeigt – nicht gespeichert.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder="Laptop" />
            </div>
            <div className="space-y-2">
              <Label>Client-Adresse (im VPN)</Label>
              <Input
                value={form.clientAddress}
                onChange={(e) => set("clientAddress", e.target.value)}
                required
                placeholder="10.10.0.2/32"
              />
            </div>
            <div className="space-y-2">
              <Label>AllowedIPs (serverseitig für diesen Peer)</Label>
              <Input value={form.allowedIps} onChange={(e) => set("allowedIps", e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Endpoint (optional)</Label>
                <Input value={form.endpoint} onChange={(e) => set("endpoint", e.target.value)} placeholder="host:port" />
              </div>
              <div className="space-y-2">
                <Label>Keepalive (Sek., optional)</Label>
                <Input
                  type="number"
                  value={form.persistentKeepalive}
                  onChange={(e) => set("persistentKeepalive", e.target.value)}
                  placeholder="25"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Client-DNS (optional)</Label>
              <Input value={form.clientDns} onChange={(e) => set("clientDns", e.target.value)} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="use-psk">Preshared Key verwenden</Label>
              <Switch id="use-psk" checked={form.usePsk} onCheckedChange={(c) => set("usePsk", !!c)} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="size-4 animate-spin" />}
                Erzeugen
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.qr} alt="QR-Code für Client-Config" className="size-56" />
            </div>
            <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs">{result.peerConfig}</pre>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={downloadConfig}>
                <Download className="size-4" />
                .conf herunterladen
              </Button>
              <Button onClick={() => setOpen(false)}>Fertig</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BulkPeersDialog({
  serverId,
  iface,
  onAdded,
}: {
  serverId: string;
  iface: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lines, setLines] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const specs = lines
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [name, clientAddress, allowedIps] = l.split(",").map((s) => s.trim());
        return { name, clientAddress, allowedIps: allowedIps || "0.0.0.0/0, ::/0", usePsk: true };
      });
    if (specs.length === 0 || specs.some((s) => !s.name || !s.clientAddress)) {
      toast.error("Format je Zeile: Name, Client-Adresse[, AllowedIPs]");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/wireguard/${encodeURIComponent(iface)}/peers/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peers: specs }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Bulk-Anlage fehlgeschlagen");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${iface}-peers.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${specs.length} Peer(s) angelegt`);
      setOpen(false);
      setLines("");
      onAdded();
    } catch {
      toast.error("Verbindung fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Download className="size-4" />
            Mehrere Peers (ZIP)
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mehrere Peers anlegen</DialogTitle>
          <DialogDescription>
            Eine Zeile pro Peer: Name, Client-Adresse[, AllowedIPs]. Alle
            Client-Configs werden direkt als ZIP heruntergeladen – die privaten
            Schlüssel werden danach nicht mehr gespeichert.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <textarea
            className="min-h-32 w-full rounded-md border bg-transparent p-2 font-mono text-xs shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={lines}
            onChange={(e) => setLines(e.target.value)}
            placeholder={"Laptop, 10.10.0.2/32\nHandy, 10.10.0.3/32"}
          />
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              Anlegen &amp; herunterladen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemovePeerButton({
  serverId,
  iface,
  peer,
  onRemoved,
}: {
  serverId: string;
  iface: string;
  peer: WgPeer;
  onRemoved: () => void;
}) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (
      !(await confirm({
        title: "Peer entfernen",
        description: `Peer "${peer.name || peer.publicKey.slice(0, 12)}" wirklich entfernen?`,
        confirmText: "Entfernen",
        variant: "destructive",
      }))
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/servers/${serverId}/wireguard/${encodeURIComponent(iface)}/peers/${encodeURIComponent(peer.publicKey)}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Entfernen fehlgeschlagen");
        return;
      }
      toast.success("Peer entfernt");
      onRemoved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="ghost" size="icon" className="size-6" disabled={busy} onClick={remove}>
      <Trash2 className="size-3.5" />
    </Button>
  );
}

function LinkServerDialog({
  serverId,
  iface,
  onLinked,
}: {
  serverId: string;
  iface: string;
  onLinked: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [servers, setServers] = useState<ServerDTO[]>([]);
  const [peerIfaces, setPeerIfaces] = useState<string[]>([]);
  const [form, setForm] = useState({
    peerServerId: "",
    peerIface: "",
    thisAllowedIps: "",
    peerAllowedIps: "",
    persistentKeepalive: "25",
  });

  useEffect(() => {
    if (!open) return;
    fetch("/api/servers")
      .then((res) => res.json())
      .then((data) =>
        setServers((data.servers as ServerDTO[]).filter((s) => s.wireguardEnabled && s.id !== serverId))
      )
      .catch(() => {});
  }, [open, serverId]);

  useEffect(() => {
    if (!form.peerServerId) {
      setPeerIfaces([]);
      return;
    }
    fetch(`/api/servers/${form.peerServerId}/wireguard`)
      .then((res) => res.json())
      .then((data) => setPeerIfaces(data.interfaces ?? []))
      .catch(() => setPeerIfaces([]));
  }, [form.peerServerId]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/wireguard/${encodeURIComponent(iface)}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peerServerId: form.peerServerId,
          peerIface: form.peerIface,
          thisAllowedIps: form.thisAllowedIps,
          peerAllowedIps: form.peerAllowedIps,
          persistentKeepalive: form.persistentKeepalive ? Number(form.persistentKeepalive) : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Verknüpfung fehlgeschlagen");
        return;
      }
      toast.success("Server verknüpft");
      setOpen(false);
      onLinked();
    } catch {
      toast.error("Verbindung fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Network className="size-4" />
            Mit Server verknüpfen
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mit anderem Server verknüpfen</DialogTitle>
          <DialogDescription>
            Trägt beide Interfaces gegenseitig als Peer ein.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-2">
            <Label>Server</Label>
            <Select value={form.peerServerId} onValueChange={(v) => set("peerServerId", v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Server wählen" />
              </SelectTrigger>
              <SelectContent>
                {servers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Interface</Label>
            <Select value={form.peerIface} onValueChange={(v) => set("peerIface", v ?? "")} disabled={!form.peerServerId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Interface wählen" />
              </SelectTrigger>
              <SelectContent>
                {peerIfaces.map((i) => (
                  <SelectItem key={i} value={i}>
                    {i}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>AllowedIPs für den anderen Server (auf diesem Interface)</Label>
            <Input
              value={form.peerAllowedIps}
              onChange={(e) => set("peerAllowedIps", e.target.value)}
              placeholder="10.10.0.0/32"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>AllowedIPs für diesen Server (auf dem anderen Interface)</Label>
            <Input
              value={form.thisAllowedIps}
              onChange={(e) => set("thisAllowedIps", e.target.value)}
              placeholder="10.20.0.0/32"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Keepalive (Sek.)</Label>
            <Input
              type="number"
              value={form.persistentKeepalive}
              onChange={(e) => set("persistentKeepalive", e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading || !form.peerIface}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              Verknüpfen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
