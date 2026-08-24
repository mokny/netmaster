"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("servers.wireguard");
  const tErrors = useTranslations("errors");
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
      toast.error(data.error ? tErrors(data.error) : t("loadFailed"));
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
        toast.error(data.error ? tErrors(data.error) : t("loadInterfaceFailed"));
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
        toast.error(data.error ? tErrors(data.error) : t("installFailed"));
        return;
      }
      toast.success(t("installSuccess"));
      await loadList();
    } catch {
      toast.error(t("connectionFailed"));
    } finally {
      setInstalling(false);
    }
  }

  async function deleteIface(name: string) {
    if (
      !(await confirm({
        title: t("deleteInterfaceTitle"),
        description: t("deleteInterfaceDescription", { name }),
        confirmText: t("delete"),
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
        toast.error(data.error ? tErrors(data.error) : t("deleteFailed"));
        return;
      }
      toast.success(t("interfaceDeleted"));
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
        toast.error(data.error ? tErrors(data.error) : t("actionFailed", { action }));
        return;
      }
      toast.success(t("actionExecuted", { name, action }));
      await loadDetail(name);
    } finally {
      setBusy(false);
    }
  }

  if (!server) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
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
            <CardTitle>{t("notInstalledTitle")}</CardTitle>
            <CardDescription>
              {t("notInstalledDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {canEdit ? (
              <Button onClick={install} disabled={installing}>
                {installing && <Loader2 className="size-4 animate-spin" />}
                {t("installWireguard")}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("noInstallPermission")}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {installed && (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <Card className="h-fit">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{t("interfaces")}</CardTitle>
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
                <p className="text-sm text-muted-foreground">{t("noInterfacesCreated")}</p>
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
              <p className="text-sm text-muted-foreground">{t("selectInterface")}</p>
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
  const t = useTranslations("servers.wireguard");
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
                {status.up ? t("active") : t("inactive")}
              </Badge>
              <Badge variant="outline">{status.enabled ? t("autostartOn") : t("autostartOff")}</Badge>
            </CardTitle>
            <CardDescription>
              {config.address ?? "–"} · {t("portLabel", { port: status.listenPort ?? config.listenPort ?? "–" })}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCw className="size-4" />
              {t("refresh")}
            </Button>
            {canEdit && (
              <>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => onControl("start")}>
                  <Play className="size-4" />
                  {t("start")}
                </Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => onControl("stop")}>
                  <Square className="size-4" />
                  {t("stop")}
                </Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => onControl("restart")}>
                  <RotateCw className="size-4" />
                  {t("restart")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => onControl(status.enabled ? "disable" : "enable")}
                >
                  {status.enabled ? t("autostartOff") : t("autostartOn")}
                </Button>
                <Button variant="destructive" size="sm" disabled={busy} onClick={onDelete}>
                  <Trash2 className="size-4" />
                  {t("delete")}
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
              <TabsTrigger value="form">{t("tabForm")}</TabsTrigger>
              <TabsTrigger value="raw">{t("tabRawConfig")}</TabsTrigger>
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
                      <TableHead>{t("name")}</TableHead>
                      <TableHead>AllowedIPs</TableHead>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Handshake</TableHead>
                      <TableHead>{t("transfer")}</TableHead>
                      {canEdit && <TableHead className="w-8" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {config.peers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-sm text-muted-foreground">
                          {t("noPeers")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      config.peers.map((peer) => {
                        const live = statusByKey.get(peer.publicKey);
                        return (
                          <TableRow key={peer.publicKey}>
                            <TableCell>
                              <div className="font-medium">{peer.name || t("unnamed")}</div>
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
                {t("formTabHint")}
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
                      {t("natForwardingActive")}
                    </Label>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("editRawConfigHint")}
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
  const t = useTranslations("servers.wireguard");
  const tErrors = useTranslations("errors");
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
        toast.error(data.error ? tErrors(data.error) : t("saveFailed"));
        return;
      }
      toast.success(t("configSaved"));
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {t("rawEditorHint")}
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
          {t("save")}
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
  const t = useTranslations("servers.wireguard");
  const tErrors = useTranslations("errors");
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "import">("create");
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
  const [importForm, setImportForm] = useState({ name: "wg0", raw: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    setImportForm((f) => ({
      ...f,
      raw: text,
      name: f.name === "wg0" && !f.raw ? file.name.replace(/\.conf$/i, "") || f.name : f.name,
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/wireguard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "import"
            ? { name: importForm.name, raw: importForm.raw }
            : {
                name: form.name,
                address: form.address,
                listenPort: Number(form.listenPort),
                dns: form.dns || undefined,
                mtu: form.mtu ? Number(form.mtu) : undefined,
                nat: form.natEnabled && form.egressIface ? { egressIface: form.egressIface } : undefined,
              }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = data.error ? tErrors(data.error) : t("createFailed");
        toast.error(data.detail ? `${message}: ${data.detail}` : message);
        return;
      }
      toast.success(mode === "import" ? t("interfaceImported") : t("interfaceCreated"));
      setOpen(false);
      await onCreated();

      if (mode === "create" && networkToolsEnabled) {
        const wantsRule = await confirm({
          title: t("createFirewallRuleTitle"),
          description: t("createFirewallRuleDescription", { port: form.listenPort }),
          confirmText: t("allow"),
          cancelText: t("no"),
        });
        if (wantsRule) {
          const fwRes = await fetch(`/api/servers/${serverId}/firewall/rules`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "allow", protocol: "udp", port: Number(form.listenPort) }),
          });
          if (fwRes.ok) toast.success(t("firewallRuleCreated"));
          else toast.error(t("firewallRuleFailed"));
        }
      }
    } catch {
      toast.error(t("connectionFailed"));
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
            {t("new")}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("newInterfaceTitle")}</DialogTitle>
          <DialogDescription>
            {mode === "import" ? t("importConfigHint") : t("keypairAutoGenerated")}
          </DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(v) => setMode((v as "create" | "import") ?? "create")}>
          <TabsList>
            <TabsTrigger value="create">{t("createTab")}</TabsTrigger>
            <TabsTrigger value="import">{t("importTab")}</TabsTrigger>
          </TabsList>

          <TabsContent value="create">
            <form onSubmit={submit} className="space-y-3 pt-3">
              <div className="space-y-2">
                <Label>{t("name")}</Label>
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
                  <Label>{t("dnsOptional")}</Label>
                  <Input value={form.dns} onChange={(e) => set("dns", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("mtuOptional")}</Label>
                  <Input value={form.mtu} onChange={(e) => set("mtu", e.target.value)} />
                </div>
              </div>

              <details
                className="rounded-md border p-3 text-sm"
                open={natOpen}
                onToggle={(e) => setNatOpen((e.target as HTMLDetailsElement).open)}
              >
                <summary className="cursor-pointer font-medium">{t("advanced")}</summary>
                <div className="mt-3 flex items-center justify-between">
                  <div>
                    <Label htmlFor="nat-enabled">{t("enableGateway")}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t("enableGatewayHint")}
                    </p>
                  </div>
                  <Switch id="nat-enabled" checked={form.natEnabled} onCheckedChange={(c) => set("natEnabled", !!c)} />
                </div>
                {form.natEnabled && (
                  <div className="mt-2 space-y-2">
                    <Label className="text-xs">{t("egressInterface")}</Label>
                    <Select value={form.egressIface} onValueChange={(v) => set("egressIface", v ?? "")}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={netInfo?.defaultIface ?? t("selectEllipsis")} />
                      </SelectTrigger>
                      <SelectContent>
                        {(netInfo?.interfaces ?? []).map((i) => (
                          <SelectItem key={i} value={i}>
                            {i}
                            {i === netInfo?.defaultIface ? t("detectedSuffix") : ""}
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
                  {t("create")}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="import">
            <form onSubmit={submit} className="space-y-3 pt-3">
              <div className="space-y-2">
                <Label>{t("name")}</Label>
                <Input
                  value={importForm.name}
                  onChange={(e) => setImportForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{t("pasteConfigLabel")}</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {t("uploadConfigFile")}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".conf,text/plain"
                    className="hidden"
                    onChange={handleFileSelected}
                  />
                </div>
                <textarea
                  className="min-h-56 w-full rounded-md border bg-transparent p-2 font-mono text-xs shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={importForm.raw}
                  onChange={(e) => setImportForm((f) => ({ ...f, raw: e.target.value }))}
                  required
                  placeholder={"[Interface]\nPrivateKey = ...\nAddress = 10.10.0.1/24\n\n[Peer]\nPublicKey = ...\nAllowedIPs = ..."}
                />
              </div>

              <DialogFooter>
                <Button type="submit" disabled={loading || !importForm.raw.trim()}>
                  {loading && <Loader2 className="size-4 animate-spin" />}
                  {t("importTab")}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
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
  const t = useTranslations("servers.wireguard");
  const tErrors = useTranslations("errors");
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
        toast.error(data.error ? tErrors(data.error) : t("peerCreateFailed"));
        return;
      }
      const qr = await QRCode.toDataURL(data.peerConfig, { margin: 1, width: 256 });
      setResult({ peerConfig: data.peerConfig, qr });
      onAdded();
    } catch {
      toast.error(t("connectionFailed"));
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
            {t("addPeer")}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("addPeer")}</DialogTitle>
          <DialogDescription>
            {t("peerKeypairHint")}
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-2">
              <Label>{t("name")}</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder="Laptop" />
            </div>
            <div className="space-y-2">
              <Label>{t("clientAddress")}</Label>
              <Input
                value={form.clientAddress}
                onChange={(e) => set("clientAddress", e.target.value)}
                required
                placeholder="10.10.0.2/32"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("allowedIpsForPeer")}</Label>
              <Input value={form.allowedIps} onChange={(e) => set("allowedIps", e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("endpointOptional")}</Label>
                <Input value={form.endpoint} onChange={(e) => set("endpoint", e.target.value)} placeholder="host:port" />
              </div>
              <div className="space-y-2">
                <Label>{t("keepaliveOptional")}</Label>
                <Input
                  type="number"
                  value={form.persistentKeepalive}
                  onChange={(e) => set("persistentKeepalive", e.target.value)}
                  placeholder="25"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("clientDnsOptional")}</Label>
              <Input value={form.clientDns} onChange={(e) => set("clientDns", e.target.value)} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="use-psk">{t("usePresharedKey")}</Label>
              <Switch id="use-psk" checked={form.usePsk} onCheckedChange={(c) => set("usePsk", !!c)} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="size-4 animate-spin" />}
                {t("generate")}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.qr} alt={t("qrCodeAlt")} className="size-56" />
            </div>
            <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs">{result.peerConfig}</pre>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={downloadConfig}>
                <Download className="size-4" />
                {t("downloadConf")}
              </Button>
              <Button onClick={() => setOpen(false)}>{t("done")}</Button>
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
  const t = useTranslations("servers.wireguard");
  const tErrors = useTranslations("errors");
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
      toast.error(t("bulkFormatHint"));
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
        toast.error(data.error ? tErrors(data.error) : t("bulkCreateFailed"));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${iface}-peers.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("peersCreated", { count: specs.length }));
      setOpen(false);
      setLines("");
      onAdded();
    } catch {
      toast.error(t("connectionFailed"));
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
            {t("bulkPeersZip")}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("createMultiplePeers")}</DialogTitle>
          <DialogDescription>
            {t("bulkPeersHint")}
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
              {t("createAndDownload")}
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
  const t = useTranslations("servers.wireguard");
  const tErrors = useTranslations("errors");
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (
      !(await confirm({
        title: t("removePeerTitle"),
        description: t("removePeerConfirm", { name: peer.name || peer.publicKey.slice(0, 12) }),
        confirmText: t("remove"),
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
        toast.error(data.error ? tErrors(data.error) : t("removeFailed"));
        return;
      }
      toast.success(t("peerRemoved"));
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
  const t = useTranslations("servers.wireguard");
  const tErrors = useTranslations("errors");
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
        toast.error(data.error ? tErrors(data.error) : t("linkFailed"));
        return;
      }
      toast.success(t("serverLinked"));
      setOpen(false);
      onLinked();
    } catch {
      toast.error(t("connectionFailed"));
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
            {t("linkWithServer")}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("linkWithAnotherServer")}</DialogTitle>
          <DialogDescription>
            {t("linkServerHint")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-2">
            <Label>Server</Label>
            <Select value={form.peerServerId} onValueChange={(v) => set("peerServerId", v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("selectServer")} />
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
                <SelectValue placeholder={t("selectInterfacePlaceholder")} />
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
            <Label>{t("allowedIpsForOtherServer")}</Label>
            <Input
              value={form.peerAllowedIps}
              onChange={(e) => set("peerAllowedIps", e.target.value)}
              placeholder="10.10.0.0/32"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>{t("allowedIpsForThisServer")}</Label>
            <Input
              value={form.thisAllowedIps}
              onChange={(e) => set("thisAllowedIps", e.target.value)}
              placeholder="10.20.0.0/32"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>{t("keepaliveSeconds")}</Label>
            <Input
              type="number"
              value={form.persistentKeepalive}
              onChange={(e) => set("persistentKeepalive", e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading || !form.peerIface}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              {t("link")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
