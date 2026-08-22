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
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useSession } from "@/hooks/use-session";
import { Loader2, Trash2, Pencil, Plus, RefreshCw, Copy } from "lucide-react";

interface SambaShare {
  name: string;
  path: string;
  guestOk: boolean;
  readUsers: string[];
  writeUsers: string[];
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

          <ShareDialog
            serverId={serverId}
            open={shareDialogOpen}
            onOpenChange={setShareDialogOpen}
            initialShare={editingShare}
            users={users ?? []}
            onSaved={loadShares}
            onUserCreated={loadUsers}
          />
        </>
      )}
    </div>
  );
}

interface Permission {
  read: boolean;
  write: boolean;
}

function ShareDialog({
  serverId,
  open,
  onOpenChange,
  initialShare,
  users,
  onSaved,
  onUserCreated,
}: {
  serverId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialShare: SambaShare | null;
  users: string[];
  onSaved: () => void;
  onUserCreated: () => void;
}) {
  const t = useTranslations("servers.storage.samba");
  const tErrors = useTranslations("errors");
  const isEdit = !!initialShare;

  const [name, setName] = useState("");
  const [path, setPath] = useState("/srv/samba/share");
  const [guestOk, setGuestOk] = useState(false);
  const [localUsers, setLocalUsers] = useState<string[]>([]);
  const [perms, setPerms] = useState<Record<string, Permission>>({});
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState(() => generateSecurePassword());
  const [creatingUser, setCreatingUser] = useState(false);
  const [saving, setSaving] = useState(false);

  // Dialog bleibt dauerhaft gemountet - Formular bei jedem (Wieder-)Öffnen
  // aus initialShare/users neu aufbauen, analog zum Muster in
  // server-form-dialog.tsx.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName(initialShare?.name ?? "");
      setPath(initialShare?.path ?? "/srv/samba/share");
      setGuestOk(initialShare?.guestOk ?? false);
      setLocalUsers(users);
      const p: Record<string, Permission> = {};
      for (const u of users) {
        p[u] = {
          read: initialShare?.readUsers.includes(u) ?? false,
          write: initialShare?.writeUsers.includes(u) ?? false,
        };
      }
      setPerms(p);
      setNewUsername("");
      setNewPassword(generateSecurePassword());
    }
  }

  function setRead(username: string, value: boolean) {
    setPerms((p) => ({
      ...p,
      [username]: { read: value, write: value ? (p[username]?.write ?? false) : false },
    }));
  }

  function setWrite(username: string, value: boolean) {
    setPerms((p) => ({
      ...p,
      [username]: { read: value ? true : (p[username]?.read ?? false), write: value },
    }));
  }

  async function createInlineUser() {
    setCreatingUser(true);
    try {
      await api(`/api/servers/${serverId}/storage/samba/users`, {
        method: "POST",
        body: JSON.stringify({ username: newUsername, password: newPassword }),
      });
      toast.success(t("userSaved"));
      setLocalUsers((u) => (u.includes(newUsername) ? u : [...u, newUsername]));
      setPerms((p) => ({ ...p, [newUsername]: { read: true, write: false } }));
      onUserCreated();
      setNewUsername("");
      setNewPassword(generateSecurePassword());
    } catch (err) {
      toast.error(err instanceof Error ? tErrors(err.message) ?? t("userSaveFailed") : t("userSaveFailed"));
    } finally {
      setCreatingUser(false);
    }
  }

  async function submit() {
    setSaving(true);
    try {
      const readUsers = localUsers.filter((u) => perms[u]?.read && !perms[u]?.write);
      const writeUsers = localUsers.filter((u) => perms[u]?.write);
      await api(`/api/servers/${serverId}/storage/samba/shares`, {
        method: "POST",
        body: JSON.stringify({ name, path, guestOk, readUsers, writeUsers }),
      });
      toast.success(t("shareSaved"));
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? tErrors(err.message) ?? t("shareSaveFailed") : t("shareSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editShareTitle") : t("newShareTitle")}</DialogTitle>
          <DialogDescription>{t("sharesDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>{t("colName")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={isEdit} />
            </div>
            <div className="space-y-1">
              <Label>{t("colPath")}</Label>
              <Input value={path} onChange={(e) => setPath(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label>{t("guestAccess")}</Label>
            <Switch checked={guestOk} onCheckedChange={setGuestOk} />
          </div>

          {!guestOk && (
            <div className="space-y-2">
              <Label>{t("permissionsLabel")}</Label>
              {localUsers.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("noUsersYetHint")}</p>
              ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                  {localUsers.map((u) => (
                    <div key={u} className="flex items-center justify-between gap-4 py-1 text-sm">
                      <span className="truncate font-mono text-xs">{u}</span>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-1.5 text-xs">
                          <Checkbox
                            checked={perms[u]?.read ?? false}
                            onCheckedChange={(v) => setRead(u, !!v)}
                          />
                          {t("read")}
                        </label>
                        <label className="flex items-center gap-1.5 text-xs">
                          <Checkbox
                            checked={perms[u]?.write ?? false}
                            onCheckedChange={(v) => setWrite(u, !!v)}
                          />
                          {t("write")}
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2 rounded-md border border-dashed p-3">
                <p className="text-xs font-medium">{t("newUserSectionTitle")}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>{t("username")}</Label>
                    <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("password")}</Label>
                    <PasswordField value={newPassword} onChange={setNewPassword} />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={creatingUser || !newUsername || !newPassword}
                  onClick={createInlineUser}
                >
                  {creatingUser && <Loader2 className="size-4 animate-spin" />}
                  <Plus className="size-3.5" />
                  {t("saveUser")}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={saving || !name || !path}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {t("saveShare")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
