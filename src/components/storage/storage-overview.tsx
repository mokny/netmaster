"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { NfsExportDialog, type NfsExport } from "@/components/servers/storage/nfs-export-dialog";
import { SambaShareDialog, type SambaShare } from "@/components/servers/storage/samba-share-dialog";

interface ServerOverview {
  id: string;
  name: string;
  hostname: string;
  nfsExports: NfsExport[];
  nfsError: string | null;
  sambaShares: SambaShare[];
  sambaError: string | null;
  sambaInstalled: boolean;
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

export function StorageOverview() {
  const t = useTranslations("storage.overview");
  const tErrors = useTranslations("errors");
  const confirm = useConfirm();

  const [servers, setServers] = useState<ServerOverview[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [editingExport, setEditingExport] = useState<(NfsExport & { serverId: string }) | null>(null);

  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [editingShare, setEditingShare] = useState<(SambaShare & { serverId: string }) | null>(null);

  function fail(err: unknown, fallback: string) {
    toast.error(err instanceof Error ? tErrors(err.message) ?? fallback : fallback);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api("/api/storage/overview");
      setServers(data.servers ?? []);
    } catch (err) {
      fail(err, t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const nfsRows = useMemo(() => {
    if (!servers) return [];
    return servers.flatMap((s) =>
      s.nfsExports.map((exp) => ({ serverId: s.id, serverName: s.name, ...exp }))
    );
  }, [servers]);

  const sambaRows = useMemo(() => {
    if (!servers) return [];
    return servers.flatMap((s) =>
      s.sambaShares.map((share) => ({ serverId: s.id, serverName: s.name, ...share }))
    );
  }, [servers]);

  const filteredNfsRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return nfsRows;
    return nfsRows.filter(
      (r) =>
        r.serverName.toLowerCase().includes(q) ||
        r.path.toLowerCase().includes(q) ||
        r.client.toLowerCase().includes(q)
    );
  }, [nfsRows, search]);

  const filteredSambaRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sambaRows;
    return sambaRows.filter(
      (r) =>
        r.serverName.toLowerCase().includes(q) ||
        r.path.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q)
    );
  }, [sambaRows, search]);

  const nfsServerOptions = useMemo(
    () => (servers ?? []).map((s) => ({ id: s.id, name: s.name })),
    [servers]
  );
  const sambaServerOptions = useMemo(
    () => (servers ?? []).filter((s) => s.sambaInstalled).map((s) => ({ id: s.id, name: s.name })),
    [servers]
  );

  function openNewExport() {
    setEditingExport(null);
    setExportDialogOpen(true);
  }

  function openEditExport(row: NfsExport & { serverId: string }) {
    setEditingExport(row);
    setExportDialogOpen(true);
  }

  async function removeExport(row: NfsExport & { serverId: string }) {
    if (!(await confirm({ title: t("removeExportTitle"), description: `${row.path} -> ${row.client}`, variant: "destructive" })))
      return;
    setBusy(true);
    try {
      await api(`/api/servers/${row.serverId}/storage/nfs/exports`, {
        method: "DELETE",
        body: JSON.stringify({ path: row.path, client: row.client }),
      });
      toast.success(t("exportRemoved"));
      load();
    } catch (err) {
      fail(err, t("exportRemoveFailed"));
    } finally {
      setBusy(false);
    }
  }

  function openNewShare() {
    setEditingShare(null);
    setShareDialogOpen(true);
  }

  function openEditShare(row: SambaShare & { serverId: string }) {
    setEditingShare(row);
    setShareDialogOpen(true);
  }

  async function removeShare(row: SambaShare & { serverId: string }) {
    if (!(await confirm({ title: t("removeShareTitle"), description: row.name, variant: "destructive" }))) return;
    setBusy(true);
    try {
      await api(`/api/servers/${row.serverId}/storage/samba/shares`, {
        method: "DELETE",
        body: JSON.stringify({ name: row.name }),
      });
      toast.success(t("shareRemoved"));
      load();
    } catch (err) {
      fail(err, t("shareRemoveFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (servers && servers.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            {t("noServersHint")}{" "}
            <Link href="/servers" className="underline underline-offset-2">
              {t("goToServers")}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
          />
          <Button variant="outline" size="icon" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>{t("nfsTitle")}</CardTitle>
            <CardDescription>{t("nfsDescription")}</CardDescription>
          </div>
          <Button size="sm" onClick={openNewExport} disabled={nfsServerOptions.length === 0}>
            <Plus className="size-4" />
            {t("newExport")}
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colServer")}</TableHead>
                <TableHead>{t("colPath")}</TableHead>
                <TableHead>{t("colClient")}</TableHead>
                <TableHead>{t("colOptions")}</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredNfsRows.map((row) => (
                <TableRow key={`${row.serverId}-${row.path}-${row.client}`}>
                  <TableCell className="text-xs">
                    <Link href={`/servers/${row.serverId}/storage`} className="underline-offset-2 hover:underline">
                      {row.serverName}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.path}</TableCell>
                  <TableCell className="font-mono text-xs">{row.client}</TableCell>
                  <TableCell className="text-xs">{row.options}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="size-7" disabled={busy} onClick={() => openEditExport(row)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7" disabled={busy} onClick={() => removeExport(row)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredNfsRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-xs text-muted-foreground">
                    {t("noExports")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>{t("sambaTitle")}</CardTitle>
            <CardDescription>{t("sambaDescription")}</CardDescription>
          </div>
          <div className="text-right">
            <Button size="sm" onClick={openNewShare} disabled={sambaServerOptions.length === 0}>
              <Plus className="size-4" />
              {t("newShare")}
            </Button>
            {sambaServerOptions.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">{t("noSambaServersHint")}</p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colServer")}</TableHead>
                <TableHead>{t("colName")}</TableHead>
                <TableHead>{t("colPath")}</TableHead>
                <TableHead>{t("colAccess")}</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSambaRows.map((row) => (
                <TableRow key={`${row.serverId}-${row.name}`}>
                  <TableCell className="text-xs">
                    <Link href={`/servers/${row.serverId}/storage`} className="underline-offset-2 hover:underline">
                      {row.serverName}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.name}</TableCell>
                  <TableCell className="font-mono text-xs">{row.path}</TableCell>
                  <TableCell className="text-xs">
                    {row.guestOk ? (
                      <Badge variant="secondary">{t("guest")}</Badge>
                    ) : (
                      <span>
                        {t("read")}: {row.readUsers.join(", ") || "-"} · {t("write")}: {row.writeUsers.join(", ") || "-"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="size-7" disabled={busy} onClick={() => openEditShare(row)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7" disabled={busy} onClick={() => removeShare(row)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredSambaRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-xs text-muted-foreground">
                    {t("noShares")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <NfsExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        serverOptions={nfsServerOptions}
        initialExport={editingExport}
        onSaved={load}
      />
      <SambaShareDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        serverOptions={sambaServerOptions}
        initialShare={editingShare}
        onSaved={load}
      />
    </div>
  );
}
