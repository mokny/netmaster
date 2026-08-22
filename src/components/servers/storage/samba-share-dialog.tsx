"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Plus } from "lucide-react";
import { generateSecurePassword, PasswordField } from "@/components/servers/storage/samba-password";

export interface SambaShare {
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

interface Permission {
  read: boolean;
  write: boolean;
}

export interface SambaShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Fester Ziel-Server (Server-eigenes Storage-Panel) - wenn gesetzt, keine
  // Server-Auswahl im Dialog.
  serverId?: string;
  // Auswählbare Server (globale Storage-Übersicht) - nur relevant beim
  // Neuanlegen; beim Bearbeiten ist der Server durch initialShare fixiert.
  serverOptions?: { id: string; name: string }[];
  initialShare: (SambaShare & { serverId: string }) | null;
  onSaved: () => void;
}

export function SambaShareDialog({
  open,
  onOpenChange,
  serverId,
  serverOptions,
  initialShare,
  onSaved,
}: SambaShareDialogProps) {
  const t = useTranslations("servers.storage.samba");
  const tErrors = useTranslations("errors");
  const isEdit = !!initialShare;
  const fixedServerId = serverId ?? initialShare?.serverId ?? null;
  const showServerPicker = !fixedServerId && !!serverOptions?.length;

  const [selectedServerId, setSelectedServerId] = useState(
    fixedServerId ?? serverOptions?.[0]?.id ?? ""
  );
  const [name, setName] = useState("");
  const [path, setPath] = useState("/srv/samba/share");
  const [guestOk, setGuestOk] = useState(false);
  const [users, setUsers] = useState<string[]>([]);
  const [perms, setPerms] = useState<Record<string, Permission>>({});
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState(() => generateSecurePassword());
  const [creatingUser, setCreatingUser] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saving, setSaving] = useState(false);

  const effectiveServerId = fixedServerId ?? selectedServerId;

  async function loadUsersFor(id: string, share: (SambaShare & { serverId: string }) | null) {
    if (!id) return;
    setLoadingUsers(true);
    try {
      const data = await api(`/api/servers/${id}/storage/samba/users`);
      const list: string[] = data.users ?? [];
      setUsers(list);
      const p: Record<string, Permission> = {};
      for (const u of list) {
        // Schreiben impliziert immer Lesen (siehe setRead/setWrite) - ein
        // Write-User steht serverseitig aber nur in writeUsers, nicht
        // zusätzlich in readUsers, sonst würde er auch als reiner Read-User
        // gezählt. Beim Laden hier trotzdem read:true setzen, sonst zeigt
        // die Checkbox-Liste für Write-User fälschlich "Lesen" als
        // deaktiviert an.
        const write = share?.writeUsers.includes(u) ?? false;
        p[u] = { read: write || (share?.readUsers.includes(u) ?? false), write };
      }
      setPerms(p);
    } catch {
      setUsers([]);
      setPerms({});
    } finally {
      setLoadingUsers(false);
    }
  }

  // Dialog bleibt dauerhaft gemountet - Formular bei jedem (Wieder-)Öffnen
  // aus initialShare neu aufbauen, analog zum Muster in server-form-dialog.tsx.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      const startServerId = fixedServerId ?? serverOptions?.[0]?.id ?? "";
      setSelectedServerId(startServerId);
      setName(initialShare?.name ?? "");
      setPath(initialShare?.path ?? "/srv/samba/share");
      setGuestOk(initialShare?.guestOk ?? false);
      setNewUsername("");
      setNewPassword(generateSecurePassword());
      void loadUsersFor(startServerId, initialShare);
    }
  }

  function selectServer(id: string) {
    setSelectedServerId(id);
    void loadUsersFor(id, null);
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
    if (!effectiveServerId) return;
    setCreatingUser(true);
    try {
      await api(`/api/servers/${effectiveServerId}/storage/samba/users`, {
        method: "POST",
        body: JSON.stringify({ username: newUsername, password: newPassword }),
      });
      toast.success(t("userSaved"));
      setUsers((u) => (u.includes(newUsername) ? u : [...u, newUsername]));
      setPerms((p) => ({ ...p, [newUsername]: { read: true, write: false } }));
      setNewUsername("");
      setNewPassword(generateSecurePassword());
    } catch (err) {
      toast.error(err instanceof Error ? tErrors(err.message) ?? t("userSaveFailed") : t("userSaveFailed"));
    } finally {
      setCreatingUser(false);
    }
  }

  async function submit() {
    if (!effectiveServerId) return;
    setSaving(true);
    try {
      const readUsers = users.filter((u) => perms[u]?.read && !perms[u]?.write);
      const writeUsers = users.filter((u) => perms[u]?.write);
      await api(`/api/servers/${effectiveServerId}/storage/samba/shares`, {
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
          {showServerPicker && (
            <div className="space-y-1">
              <Label>{t("targetServer")}</Label>
              <Select value={selectedServerId} onValueChange={(v) => selectServer(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {serverOptions!.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {fixedServerId && isEdit && serverOptions && (
            <p className="text-xs text-muted-foreground">
              {t("targetServer")}: {serverOptions.find((s) => s.id === fixedServerId)?.name ?? fixedServerId}
            </p>
          )}

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
              {loadingUsers ? (
                <p className="text-xs text-muted-foreground">{t("loading")}</p>
              ) : users.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("noUsersYetHint")}</p>
              ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                  {users.map((u) => (
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
                  disabled={creatingUser || !newUsername || !newPassword || !effectiveServerId}
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
          <Button onClick={submit} disabled={saving || !name || !path || !effectiveServerId}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {t("saveShare")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
