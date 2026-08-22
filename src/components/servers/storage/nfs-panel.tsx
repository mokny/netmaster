"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useSession } from "@/hooks/use-session";
import { Loader2, Trash2, Pencil, Plus } from "lucide-react";
import { NfsExportDialog, type NfsExport } from "@/components/servers/storage/nfs-export-dialog";

interface NfsClientMount {
  remote: string;
  mountpoint: string;
  options: string;
}

interface NfsSource {
  id: string;
  name: string;
  hostname: string;
  exports: NfsExport[];
}

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "ERROR");
  return data;
}

export function NfsPanel({ serverId }: { serverId: string }) {
  const t = useTranslations("servers.storage.nfs");
  const tErrors = useTranslations("errors");
  const session = useSession();
  const confirm = useConfirm();
  const canEdit = session?.role === "EDITOR" || session?.role === "ADMIN";

  const [exports, setExports] = useState<NfsExport[] | null>(null);
  const [mounts, setMounts] = useState<NfsClientMount[] | null>(null);
  const [sources, setSources] = useState<NfsSource[]>([]);
  const [busy, setBusy] = useState(false);

  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [editingExport, setEditingExport] = useState<NfsExport | null>(null);

  const [remote, setRemote] = useState("");
  const [clientMountpoint, setClientMountpoint] = useState("/mnt/nfs");
  const [clientOptions, setClientOptions] = useState("defaults,_netdev");

  function fail(err: unknown, fallback: string) {
    toast.error(err instanceof Error ? tErrors(err.message) ?? fallback : fallback);
  }

  const loadExports = useCallback(async () => {
    try {
      const data = await api(`/api/servers/${serverId}/storage/nfs/exports`);
      setExports(data.exports ?? []);
    } catch (err) {
      fail(err, t("loadFailed"));
    }
  }, [serverId]);

  const loadMounts = useCallback(async () => {
    try {
      const data = await api(`/api/servers/${serverId}/storage/nfs/client`);
      setMounts(data.mounts ?? []);
    } catch (err) {
      fail(err, t("loadFailed"));
    }
  }, [serverId]);

  const loadSources = useCallback(async () => {
    try {
      const data = await api(`/api/storage/nfs-sources`);
      setSources((data.sources ?? []).filter((s: NfsSource) => s.id !== serverId));
    } catch {
      // best effort
    }
  }, [serverId]);

  useEffect(() => {
    loadExports();
    loadMounts();
    loadSources();
  }, [loadExports, loadMounts, loadSources]);

  function openNewExport() {
    setEditingExport(null);
    setExportDialogOpen(true);
  }

  function openEditExport(exp: NfsExport) {
    setEditingExport(exp);
    setExportDialogOpen(true);
  }

  async function removeExport(exp: NfsExport) {
    if (!(await confirm({ title: t("removeExportTitle"), description: `${exp.path} -> ${exp.client}`, variant: "destructive" }))) return;
    setBusy(true);
    try {
      await api(`/api/servers/${serverId}/storage/nfs/exports`, {
        method: "DELETE",
        body: JSON.stringify({ path: exp.path, client: exp.client }),
      });
      toast.success(t("exportRemoved"));
      loadExports();
    } catch (err) {
      fail(err, t("exportRemoveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function addMount() {
    setBusy(true);
    try {
      await api(`/api/servers/${serverId}/storage/nfs/client`, {
        method: "POST",
        body: JSON.stringify({ remote, mountpoint: clientMountpoint, options: clientOptions }),
      });
      toast.success(t("mountAdded"));
      loadMounts();
    } catch (err) {
      fail(err, t("mountAddFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeMount(m: NfsClientMount) {
    if (!(await confirm({ title: t("removeMountTitle"), description: m.mountpoint, variant: "destructive" }))) return;
    setBusy(true);
    try {
      await api(`/api/servers/${serverId}/storage/nfs/client`, {
        method: "DELETE",
        body: JSON.stringify({ mountpoint: m.mountpoint }),
      });
      toast.success(t("mountRemoved"));
      loadMounts();
    } catch (err) {
      fail(err, t("mountRemoveFailed"));
    } finally {
      setBusy(false);
    }
  }

  const remoteOptions = sources.flatMap((s) =>
    s.exports.map((e) => ({ label: `${s.name}: ${e.path}`, value: `${s.hostname}:${e.path}` }))
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>{t("serverTitle")}</CardTitle>
            <CardDescription>{t("serverDescription")}</CardDescription>
          </div>
          {canEdit && (
            <Button size="sm" onClick={openNewExport}>
              <Plus className="size-4" />
              {t("newExport")}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colPath")}</TableHead>
                <TableHead>{t("colClient")}</TableHead>
                <TableHead>{t("colOptions")}</TableHead>
                {canEdit && <TableHead className="text-right" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(exports ?? []).map((exp) => (
                <TableRow key={`${exp.path}-${exp.client}`}>
                  <TableCell className="font-mono text-xs">{exp.path}</TableCell>
                  <TableCell className="font-mono text-xs">{exp.client}</TableCell>
                  <TableCell className="text-xs">{exp.options}</TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="size-7" disabled={busy} onClick={() => openEditExport(exp)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-7" disabled={busy} onClick={() => removeExport(exp)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {exports?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-xs text-muted-foreground">
                    {t("noExports")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <NfsExportDialog
        serverId={serverId}
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        initialExport={editingExport ? { ...editingExport, serverId } : null}
        onSaved={loadExports}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("clientTitle")}</CardTitle>
          <CardDescription>{t("clientDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colRemote")}</TableHead>
                <TableHead>{t("colMountpoint")}</TableHead>
                <TableHead>{t("colOptions")}</TableHead>
                {canEdit && <TableHead className="text-right" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(mounts ?? []).map((m) => (
                <TableRow key={m.mountpoint}>
                  <TableCell className="font-mono text-xs">{m.remote}</TableCell>
                  <TableCell className="font-mono text-xs">{m.mountpoint}</TableCell>
                  <TableCell className="text-xs">{m.options}</TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="size-7" disabled={busy} onClick={() => removeMount(m)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {mounts?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-xs text-muted-foreground">
                    {t("noMounts")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {canEdit && (
            <div className="space-y-2 border-t pt-3">
              {remoteOptions.length > 0 && (
                <div className="space-y-1">
                  <Label>{t("knownExports")}</Label>
                  <Select value={remote} onValueChange={(v) => setRemote(v ?? "")}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("selectKnownExport")} />
                    </SelectTrigger>
                    <SelectContent>
                      {remoteOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label>{t("colRemote")}</Label>
                  <Input placeholder="host:/export" value={remote} onChange={(e) => setRemote(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{t("colMountpoint")}</Label>
                  <Input value={clientMountpoint} onChange={(e) => setClientMountpoint(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{t("colOptions")}</Label>
                  <Input value={clientOptions} onChange={(e) => setClientOptions(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <Button disabled={busy || !remote || !clientMountpoint} onClick={addMount} className="w-full">
                    {busy && <Loader2 className="size-4 animate-spin" />}
                    {t("addMount")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
