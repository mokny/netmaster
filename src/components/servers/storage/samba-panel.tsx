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
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useSession } from "@/hooks/use-session";
import { Loader2, Trash2 } from "lucide-react";

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

export function SambaPanel({ serverId }: { serverId: string }) {
  const t = useTranslations("servers.storage.samba");
  const tErrors = useTranslations("errors");
  const session = useSession();
  const confirm = useConfirm();
  const canEdit = session?.role === "EDITOR" || session?.role === "ADMIN";

  const [users, setUsers] = useState<string[] | null>(null);
  const [shares, setShares] = useState<SambaShare[] | null>(null);
  const [busy, setBusy] = useState(false);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [shareName, setShareName] = useState("");
  const [sharePath, setSharePath] = useState("/srv/samba/share");
  const [shareGuest, setShareGuest] = useState(false);
  const [shareRead, setShareRead] = useState("");
  const [shareWrite, setShareWrite] = useState("");

  function fail(err: unknown, fallback: string) {
    toast.error(err instanceof Error ? tErrors(err.message) ?? fallback : fallback);
  }

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
    loadUsers();
    loadShares();
  }, [loadUsers, loadShares]);

  async function createUser() {
    setBusy(true);
    try {
      await api(`/api/servers/${serverId}/storage/samba/users`, {
        method: "POST",
        body: JSON.stringify({ username: newUsername, password: newPassword }),
      });
      toast.success(t("userSaved"));
      setNewUsername("");
      setNewPassword("");
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
    } catch (err) {
      fail(err, t("userRemoveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function saveShare() {
    setBusy(true);
    try {
      await api(`/api/servers/${serverId}/storage/samba/shares`, {
        method: "POST",
        body: JSON.stringify({
          name: shareName,
          path: sharePath,
          guestOk: shareGuest,
          readUsers: shareRead.split(/\s+/).filter(Boolean),
          writeUsers: shareWrite.split(/\s+/).filter(Boolean),
        }),
      });
      toast.success(t("shareSaved"));
      setShareName("");
      loadShares();
    } catch (err) {
      fail(err, t("shareSaveFailed"));
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

  return (
    <div className="space-y-4">
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
              <div className="space-y-1">
                <Label>{t("password")}</Label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
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
          <CardTitle>{t("sharesTitle")}</CardTitle>
          <CardDescription>{t("sharesDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                      <Button variant="ghost" size="icon" className="size-7" disabled={busy} onClick={() => removeShare(s.name)}>
                        <Trash2 className="size-3.5" />
                      </Button>
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

          {canEdit && (
            <div className="space-y-2 border-t pt-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>{t("colName")}</Label>
                  <Input value={shareName} onChange={(e) => setShareName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{t("colPath")}</Label>
                  <Input value={sharePath} onChange={(e) => setSharePath(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>{t("guestAccess")}</Label>
                <Switch checked={shareGuest} onCheckedChange={setShareGuest} />
              </div>
              {!shareGuest && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>{t("readUsers")}</Label>
                    <Input placeholder="alice bob" value={shareRead} onChange={(e) => setShareRead(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("writeUsers")}</Label>
                    <Input placeholder="alice" value={shareWrite} onChange={(e) => setShareWrite(e.target.value)} />
                  </div>
                </div>
              )}
              <Button disabled={busy || !shareName || !sharePath} onClick={saveShare}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                {t("saveShare")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
