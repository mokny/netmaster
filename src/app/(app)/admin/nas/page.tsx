"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { NasUserFormDialog } from "@/components/admin/nas-user-form-dialog";
import { NasShareFormDialog } from "@/components/admin/nas-share-form-dialog";
import { NasShareMembersDialog } from "@/components/admin/nas-share-members-dialog";
import { Pencil, Trash2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import type { NasUserDTO, NasShareDTO, ServerDTO } from "@/lib/types";

function formatBytes(value: string | null): string {
  if (value === null) return "–";
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return "–";
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)} GB`;
}

export default function NasAdminPage() {
  const t = useTranslations("admin.nas");
  const tErrors = useTranslations("errors");
  const confirm = useConfirm();

  const [nasUsers, setNasUsers] = useState<NasUserDTO[] | null>(null);
  const [shares, setShares] = useState<NasShareDTO[] | null>(null);
  const [servers, setServers] = useState<ServerDTO[] | null>(null);

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/admin/nas/users");
    if (res.ok) setNasUsers((await res.json()).nasUsers);
  }, []);
  const loadShares = useCallback(async () => {
    const res = await fetch("/api/admin/nas/shares");
    if (res.ok) setShares((await res.json()).shares);
  }, []);

  useEffect(() => {
    loadUsers();
    loadShares();
    fetch("/api/servers")
      .then((res) => (res.ok ? res.json() : { servers: [] }))
      .then((data) => setServers(data.servers));
  }, [loadUsers, loadShares]);

  async function deleteUser(id: string) {
    if (
      !(await confirm({
        title: t("deleteUserTitle"),
        description: t("deleteUserDescription"),
        confirmText: t("delete"),
        variant: "destructive",
      }))
    )
      return;
    const res = await fetch(`/api/admin/nas/users/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(t("userDeleted"));
      loadUsers();
    } else {
      const data = await res.json();
      toast.error(tErrors(data.error ?? "INTERNAL_ERROR"));
    }
  }

  async function deleteShare(id: string) {
    if (
      !(await confirm({
        title: t("deleteShareTitle"),
        description: t("deleteShareDescription"),
        confirmText: t("delete"),
        variant: "destructive",
      }))
    )
      return;
    const res = await fetch(`/api/admin/nas/shares/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(t("shareDeleted"));
      loadShares();
    } else {
      const data = await res.json();
      toast.error(tErrors(data.error ?? "INTERNAL_ERROR"));
    }
  }

  const storageServers = (servers ?? []).filter((s) => s.storageEnabled);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">{t("usersHeading")}</h2>
          <NasUserFormDialog onSaved={loadUsers} />
        </div>
        {nasUsers === null ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("email")}</TableHead>
                  <TableHead>{t("publicLinks")}</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {nasUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.canCreatePublicLinks ? "secondary" : "outline"}>
                        {u.canCreatePublicLinks ? t("allowed") : t("blocked")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <NasUserFormDialog
                          nasUser={u}
                          onSaved={loadUsers}
                          trigger={
                            <Button variant="ghost" size="icon" className="size-7">
                              <Pencil className="size-3.5" />
                            </Button>
                          }
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => deleteUser(u.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">{t("sharesHeading")}</h2>
          <NasShareFormDialog servers={storageServers} onSaved={loadShares} />
        </div>
        {storageServers.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("noStorageServers")}</p>
        )}
        {shares === null ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("server")}</TableHead>
                  <TableHead>{t("usage")}</TableHead>
                  <TableHead>{t("mount")}</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shares.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {s.name}
                      {s.readOnlyLocked && (
                        <Badge variant="destructive" className="ml-2">
                          {t("quotaExceeded")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.server.name} ({s.remotePath})
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatBytes(s.usedBytes)} / {formatBytes(s.quotaBytes) === "–" ? t("quotaUnlimited") : formatBytes(s.quotaBytes)}
                    </TableCell>
                    <TableCell>
                      {s.mountActive ? (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="size-3" />
                          {t("mountActive")}
                        </Badge>
                      ) : s.mountError ? (
                        <Badge variant="destructive" className="gap-1" title={s.mountError}>
                          <XCircle className="size-3" />
                          {t("mountFailed")}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1">
                          <AlertTriangle className="size-3" />
                          {t("mountPending")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <NasShareMembersDialog
                          share={s}
                          nasUsers={nasUsers ?? []}
                          onSaved={loadShares}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => deleteShare(s.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
