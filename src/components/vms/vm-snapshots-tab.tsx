"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Camera, History, Loader2, Trash2 } from "lucide-react";
import type { ProxmoxSnapshotDTO } from "@/lib/types";

interface Props {
  serverId: string;
  vmid: number;
  vmType: "QEMU" | "LXC";
  canControl: boolean;
}

export function VmSnapshotsTab({ serverId, vmid, vmType, canControl }: Props) {
  const t = useTranslations("vms.snapshotsTab");
  const locale = useLocale();
  const [snapshots, setSnapshots] = useState<ProxmoxSnapshotDTO[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const res = await fetch(`/api/servers/${serverId}/vms/${vmid}/snapshots`);
    if (res.ok) {
      const data = await res.json();
      setSnapshots(data.snapshots);
      setSelected(new Set());
    }
  }, [serverId, vmid]);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(name: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(name);
      else next.delete(name);
      return next;
    });
  }

  if (!snapshots) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t("snapshotCount", { count: snapshots.length })}
        </p>
        {canControl && (
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <DeleteSnapshotsDialog
                serverId={serverId}
                vmid={vmid}
                names={Array.from(selected)}
                onDone={load}
              />
            )}
            <CreateSnapshotDialog serverId={serverId} vmid={vmid} vmType={vmType} onDone={load} />
          </div>
        )}
      </div>

      {snapshots.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("noSnapshots")}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {canControl && <TableHead className="w-8" />}
              <TableHead>Name</TableHead>
              <TableHead>{t("description")}</TableHead>
              <TableHead>{t("created")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {snapshots.map((snap) => (
              <TableRow key={snap.name}>
                {canControl && (
                  <TableCell
                    className="cursor-pointer"
                    onClick={() => toggle(snap.name, !selected.has(snap.name))}
                  >
                    <Checkbox
                      checked={selected.has(snap.name)}
                      onCheckedChange={(c) => toggle(snap.name, !!c)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </TableCell>
                )}
                <TableCell className="font-medium">
                  {snap.name}
                  {snap.hasVmstate && (
                    <Badge variant="secondary" className="ml-2">
                      RAM
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="max-w-64 truncate text-muted-foreground">
                  {snap.description || "–"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {snap.timestamp ? new Date(snap.timestamp).toLocaleString(locale) : "–"}
                </TableCell>
                <TableCell className="text-right">
                  {canControl && (
                    <RollbackDialog serverId={serverId} vmid={vmid} name={snap.name} onDone={load} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

const SNAPSHOT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

function CreateSnapshotDialog({
  serverId,
  vmid,
  vmType,
  onDone,
}: {
  serverId: string;
  vmid: number;
  vmType: "QEMU" | "LXC";
  onDone: () => void;
}) {
  const t = useTranslations("vms.snapshotsTab.createDialog");
  const tErrors = useTranslations("errors");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [vmstate, setVmstate] = useState(false);
  const [loading, setLoading] = useState(false);

  const nameValid = SNAPSHOT_NAME_PATTERN.test(name);

  async function create() {
    if (!nameValid) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/vms/${vmid}/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || undefined, vmstate }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ? tErrors(data.error) : t("createFailed"));
        return;
      }
      toast.success(t("createSuccess"));
      setOpen(false);
      setName("");
      setDescription("");
      setVmstate(false);
      onDone();
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
          <Button variant="outline" size="sm">
            <Camera className="size-4" />
            {t("trigger")}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("trigger")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="snap-name">Name</Label>
            <Input
              id="snap-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="before-update"
            />
            {name.length > 0 && !nameValid && (
              <p className="text-xs text-destructive">
                {t("nameHint")}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="snap-desc">{t("descriptionOptional")}</Label>
            <Input
              id="snap-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {vmType === "QEMU" && (
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="snap-vmstate">{t("includeMemoryState")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("includeMemoryStateHint")}
                </p>
              </div>
              <Switch id="snap-vmstate" checked={vmstate} onCheckedChange={(c) => setVmstate(!!c)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button disabled={loading || !nameValid} onClick={create}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteSnapshotsDialog({
  serverId,
  vmid,
  names,
  onDone,
}: {
  serverId: string;
  vmid: number;
  names: string[];
  onDone: () => void;
}) {
  const t = useTranslations("vms.snapshotsTab.deleteDialog");
  const tErrors = useTranslations("errors");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function remove() {
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/vms/${vmid}/snapshots/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ? tErrors(data.error) : t("deleteFailed"));
        return;
      }
      const { ok, failed } = data.results as { ok: string[]; failed: { name: string; error: string }[] };
      if (failed.length === 0) {
        toast.success(t("deleteSuccess", { count: ok.length }));
      } else {
        toast.error(
          t("partialFailure", {
            ok: ok.length,
            total: names.length,
            failed: failed.length,
            details: failed.map((f) => `${f.name} – ${f.error}`).join("; "),
          })
        );
      }
      setOpen(false);
      onDone();
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
          <Button variant="destructive" size="sm">
            <Trash2 className="size-4" />
            {t("deleteN", { count: names.length })}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("confirmTitle", { count: names.length })}</DialogTitle>
          <DialogDescription>
            {names.join(", ")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="destructive" disabled={loading} onClick={remove}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {t("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RollbackDialog({
  serverId,
  vmid,
  name,
  onDone,
}: {
  serverId: string;
  vmid: number;
  name: string;
  onDone: () => void;
}) {
  const t = useTranslations("vms.snapshotsTab.rollbackDialog");
  const tErrors = useTranslations("errors");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function rollback() {
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/vms/${vmid}/snapshots/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ? tErrors(data.error) : t("rollbackFailed"));
        return;
      }
      toast.success(t("rollbackSuccess"));
      setOpen(false);
      onDone();
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
          <Button variant="ghost" size="icon" className="size-6" title={t("restore")}>
            <History className="size-3.5" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("confirmTitle")}</DialogTitle>
          <DialogDescription>
            {t("confirmDescription", { name })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="destructive" disabled={loading} onClick={rollback}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {t("reset")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
