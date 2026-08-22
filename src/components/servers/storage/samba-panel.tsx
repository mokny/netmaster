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
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useSession } from "@/hooks/use-session";
import { Loader2, Trash2, Pencil, Plus, RefreshCw, Copy } from "lucide-react";
import { SambaShareDialog, type SambaShare } from "@/components/servers/storage/samba-share-dialog";

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "ERROR");
  return data;
}

const PASSWORD_CHARSET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+";

function generateSecurePassword(length = 20): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSWORD_CHARSET[b % PASSWORD_CHARSET.length]).join("");
}

function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const tCommon = useTranslations("common");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(tCommon("copied"));
    } catch {
      // clipboard unavailable - user can still select the field manually
    }
  }
  return (
    <div className="flex gap-1">
      <Input className="font-mono" value={value} onChange={(e) => onChange(e.target.value)} />
      <Button type="button" variant="outline" size="icon" onClick={() => onChange(generateSecurePassword())}>
        <RefreshCw className="size-4" />
      </Button>
      <Button type="button" variant="outline" size="icon" onClick={copy}>
        <Copy className="size-4" />
      </Button>
    </div>
  );
}

export function SambaPanel({ serverId }: { serverId: string }) {
  const t = useTranslations("servers.storage.samba");
  const tErrors = useTranslations("errors");
  const session = useSession();
  const confirm = useConfirm();
  const canEdit = session?.role === "EDITOR" || session?.role === "ADMIN";

  const [installed, setInstalled] = useState<boolean | null>(null);
  const [users, setUsers] = useState<string[] | null>(null);
  const [shares, setShares] = useState<SambaShare[] | null>(null);
  const [busy, setBusy] = useState(false);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState(() => generateSecurePassword());

  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [editingShare, setEditingShare] = useState<SambaShare | null>(null);

  function fail(err: unknown, fallback: string) {
    toast.error(err instanceof Error ? tErrors(err.message) ?? fallback : fallback);
  }

  const loadInstalled = useCallback(async () => {
    try {
      const data = await api(`/api/servers/${serverId}/storage/samba/install`);
      setInstalled(!!data.installed);
    } catch (err) {
      fail(err, t("loadFailed"));
    }
  }, [serverId]);

  const loadUsers = useCallback(async () => {
    try {
      const data = await api(`/api/servers/${serverId}/storage/samba/users`);
      setUsers(data.users ?? []);
    } catch (err) {
      fail(err, t("loadFailed"));
    }
  }, [serverId]);

  const loadShares = useCallback(async () => {
    try {
      const data = await api(`/api/servers/${serverId}/storage/samba/shares`);
      setShares(data.shares ?? []);
    } catch (err) {
      fail(err, t("loadFailed"));
    }
  }, [serverId]);

  useEffect(() => {
    loadInstalled();
    loadUsers();
    loadShares();
  }, [loadInstalled, loadUsers, loadShares]);

  async function installNow() {
    setBusy(true);
    try {
      await api(`/api/servers/${serverId}/storage/samba/install`, { method: "POST" });
      toast.success(t("installSuccess"));
      loadInstalled();
    } catch (err) {
      fail(err, t("installFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function uninstallNow() {
    if (!(await confirm({ title: t("uninstallTitle"), description: t("uninstallDescription"), variant: "destructive" })))
      return;
    setBusy(true);
    try {
      await api(`/api/servers/${serverId}/storage/samba/install`, { method: "DELETE" });
      toast.success(t("uninstallSuccess"));
      loadInstalled();
    } catch (err) {
      fail(err, t("uninstallFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function createUser() {
    setBusy(true);
    try {
      await api(`/api/servers/${serverId}/storage/samba/users`, {
        method: "POST",
        body: JSON.stringify({ username: newUsername, password: newPassword }),
      });
      toast.success(t("userSaved"));
      setNewUsername("");
      setNewPassword(generateSecurePassword());
      loadUsers();
    } catch (err) {
      fail(err, t("userSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(username: string) {
    if (!(await confirm({ title: t("removeUserTitle"), description: username, variant: "destructive" }))) return;
    setBusy(true);
    try {
      await api(`/api/servers/${serverId}/storage/samba/users`, {
        method: "DELETE",
        body: JSON.stringify({ username, removeSystemUser: true }),
      });
      toast.success(t("userRemoved"));
      loadUsers();
      loadShares();
    } catch (err) {
      fail(err, t("userRemoveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeShare(name: string) {
    if (!(await confirm({ title: t("removeShareTitle"), description: name, variant: "destructive" }))) return;
    setBusy(true);
    try {
      await api(`/api/servers/${serverId}/storage/samba/shares`, {
        method: "DELETE",
        body: JSON.stringify({ name }),
      });
      toast.success(t("shareRemoved"));
      loadShares();
    } catch (err) {
      fail(err, t("shareRemoveFailed"));
    } finally {
      setBusy(false);
    }
  }

  function openNewShare() {
    setEditingShare(null);
    setShareDialogOpen(true);
  }

  function openEditShare(share: SambaShare) {
    setEditingShare(share);
    setShareDialogOpen(true);
  }

  function handleShareSaved() {
    loadShares();
    loadUsers();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Samba</CardTitle>
            <CardDescription>
              {installed === false ? t("notInstalledDescription") : t("installedDescription")}
            </CardDescription>
          </div>
          {canEdit && installed === false && (
            <Button size="sm" onClick={installNow} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {t("install")}
            </Button>
          )}
          {canEdit && installed === true && (
            <Button size="sm" variant="destructive" onClick={uninstallNow} disabled={busy}>
              {t("uninstall")}
            </Button>
          )}
        </CardHeader>
      </Card>

      {installed !== false && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("usersTitle")}</CardTitle>
              <CardDescription>{t("usersDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(users ?? []).map((u) => (
                  <Badge key={u} variant="secondary" className="gap-1">
                    {u}
                    {canEdit && (
                      <button onClick={() => removeUser(u)} disabled={busy} className="ml-1">
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </Badge>
                ))}
                {users?.length === 0 && <p className="text-xs text-muted-foreground">{t("noUsers")}</p>}
              </div>
              {canEdit && (
                <div className="grid gap-2 border-t pt-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label>{t("username")}</Label>
                    <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>{t("password")}</Label>
                    <PasswordField value={newPassword} onChange={setNewPassword} />
                  </div>
                  <div className="flex items-end">
                    <Button disabled={busy || !newUsername || !newPassword} onClick={createUser} className="w-full">
                      {busy && <Loader2 className="size-4 animate-spin" />}
                      {t("saveUser")}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>{t("sharesTitle")}</CardTitle>
                <CardDescription>{t("sharesDescription")}</CardDescription>
              </div>
              {canEdit && (
                <Button size="sm" onClick={openNewShare}>
                  <Plus className="size-4" />
                  {t("newShare")}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colName")}</TableHead>
                    <TableHead>{t("colPath")}</TableHead>
                    <TableHead>{t("colAccess")}</TableHead>
                    {canEdit && <TableHead className="text-right" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(shares ?? []).map((s) => (
                    <TableRow key={s.name}>
                      <TableCell className="font-mono text-xs">{s.name}</TableCell>
                      <TableCell className="font-mono text-xs">{s.path}</TableCell>
                      <TableCell className="text-xs">
                        {s.guestOk ? (
                          <Badge variant="secondary">{t("guest")}</Badge>
                        ) : (
                          <span>
                            {t("read")}: {s.readUsers.join(", ") || "-"} · {t("write")}: {s.writeUsers.join(", ") || "-"}
                          </span>
                        )}
                      </TableCell>
                      {canEdit && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="size-7" disabled={busy} onClick={() => openEditShare(s)}>
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-7" disabled={busy} onClick={() => removeShare(s.name)}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {shares?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-xs text-muted-foreground">
                        {t("noShares")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <SambaShareDialog
            serverId={serverId}
            open={shareDialogOpen}
            onOpenChange={setShareDialogOpen}
            initialShare={editingShare ? { ...editingShare, serverId } : null}
            onSaved={handleShareSaved}
          />
        </>
      )}
    </div>
  );
}
