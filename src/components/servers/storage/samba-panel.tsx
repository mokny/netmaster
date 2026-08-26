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
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useSession } from "@/hooks/use-session";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Trash2, Pencil, Plus, KeyRound, Copy, Check } from "lucide-react";
import { SambaShareDialog, type SambaShare } from "@/components/servers/storage/samba-share-dialog";
import { generateSecurePassword, PasswordField } from "@/components/servers/storage/samba-password";

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "ERROR");
  return data;
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
  const [webUsers, setWebUsers] = useState<Record<string, { webUiEnabled: boolean; thumbnailsEnabled: boolean }>>({});

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState(() => generateSecurePassword());

  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [editingShare, setEditingShare] = useState<SambaShare | null>(null);

  const [passwordDialogUser, setPasswordDialogUser] = useState<string | null>(null);

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

  const loadWebUsers = useCallback(async () => {
    try {
      const data = await api(`/api/servers/${serverId}/storage/samba/web-users`);
      const map: Record<string, { webUiEnabled: boolean; thumbnailsEnabled: boolean }> = {};
      for (const wu of data.webUsers ?? []) {
        map[wu.username] = { webUiEnabled: wu.webUiEnabled, thumbnailsEnabled: wu.thumbnailsEnabled };
      }
      setWebUsers(map);
    } catch {
      // Nicht kritisch für den Rest des Panels - Web-Zugriff-Sektion bleibt einfach leer.
    }
  }, [serverId]);

  useEffect(() => {
    loadInstalled();
    loadUsers();
    loadShares();
    loadWebUsers();
  }, [loadInstalled, loadUsers, loadShares, loadWebUsers]);

  async function setWebAccess(
    username: string,
    patch: Partial<{ webUiEnabled: boolean; thumbnailsEnabled: boolean }>
  ) {
    const current = webUsers[username] ?? { webUiEnabled: false, thumbnailsEnabled: false };
    const next = { ...current, ...patch };
    setWebUsers((prev) => ({ ...prev, [username]: next }));
    try {
      await api(`/api/servers/${serverId}/storage/samba/web-users`, {
        method: "PUT",
        body: JSON.stringify({ username, ...next }),
      });
    } catch (err) {
      setWebUsers((prev) => ({ ...prev, [username]: current }));
      fail(err, "Änderung konnte nicht gespeichert werden");
    }
  }

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
                      <button onClick={() => setPasswordDialogUser(u)} disabled={busy} className="ml-1" title={t("changePassword")}>
                        <KeyRound className="size-3" />
                      </button>
                    )}
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
            <CardHeader>
              <CardTitle>Web-Dateizugriff</CardTitle>
              <CardDescription>
                Schaltet für einzelne Samba-Nutzer den mobilen Web-Dateimanager frei (eigener Login,
                unabhängig vom NetMaster-Adminbereich).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(users ?? []).length === 0 && <p className="text-xs text-muted-foreground">{t("noUsers")}</p>}
              {(users ?? []).map((u) => {
                const access = webUsers[u] ?? { webUiEnabled: false, thumbnailsEnabled: false };
                return (
                  <div key={u} className="flex flex-col gap-2 border-t pt-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-mono text-xs">{u}</span>
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-xs">
                        <Switch
                          checked={access.webUiEnabled}
                          onCheckedChange={(c) => setWebAccess(u, { webUiEnabled: !!c })}
                          disabled={!canEdit}
                        />
                        Web-Dateizugriff aktivieren
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <Switch
                          checked={access.thumbnailsEnabled}
                          onCheckedChange={(c) => setWebAccess(u, { thumbnailsEnabled: !!c })}
                          disabled={!canEdit || !access.webUiEnabled}
                        />
                        Vorschaubilder
                      </label>
                      {access.webUiEnabled && <CopyLinkButton serverId={serverId} />}
                    </div>
                  </div>
                );
              })}
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

          <ChangePasswordDialog
            serverId={serverId}
            username={passwordDialogUser}
            onOpenChange={(open) => !open && setPasswordDialogUser(null)}
          />
        </>
      )}
    </div>
  );
}

function CopyLinkButton({ serverId }: { serverId: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/filebrowser/${serverId}/login`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Link konnte nicht kopiert werden");
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={copy} className="gap-1.5">
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      Link kopieren
    </Button>
  );
}

function ChangePasswordDialog({
  serverId,
  username,
  onOpenChange,
}: {
  serverId: string;
  username: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("servers.storage.samba");
  const tErrors = useTranslations("errors");
  const [password, setPassword] = useState(() => generateSecurePassword());
  const [saving, setSaving] = useState(false);

  const [prevUsername, setPrevUsername] = useState(username);
  if (username !== prevUsername) {
    setPrevUsername(username);
    if (username) setPassword(generateSecurePassword());
  }

  async function submit() {
    if (!username) return;
    setSaving(true);
    try {
      await api(`/api/servers/${serverId}/storage/samba/users`, {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      toast.success(t("passwordChanged"));
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? tErrors(err.message) ?? t("passwordChangeFailed") : t("passwordChangeFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!username} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("changePasswordTitle")}</DialogTitle>
          <DialogDescription>{username}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label>{t("password")}</Label>
          <PasswordField value={password} onChange={setPassword} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={saving || !password}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {t("saveUser")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
