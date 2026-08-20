"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArchiveRestore, DatabaseBackup, Loader2, Trash2 } from "lucide-react";
import type { ProxmoxBackupDTO } from "@/lib/types";

interface Props {
  serverId: string;
  vmid: number;
  canControl: boolean;
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return "–";
  const gb = bytes / 1024 / 1024 / 1024;
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

export function VmBackupsTab({ serverId, vmid, canControl }: Props) {
  const [backups, setBackups] = useState<ProxmoxBackupDTO[] | null>(null);
  const [storages, setStorages] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const res = await fetch(`/api/servers/${serverId}/vms/${vmid}/backups`);
    if (res.ok) {
      const data = await res.json();
      setBackups(data.backups);
      setStorages(data.storages);
      setSelected(new Set());
    }
  }, [serverId, vmid]);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(volid: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(volid);
      else next.delete(volid);
      return next;
    });
  }

  if (!backups) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const selectedItems = backups
    .filter((b) => selected.has(b.volid))
    .map((b) => ({ storage: b.storage, volid: b.volid }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {backups.length} Backup{backups.length === 1 ? "" : "s"}
        </p>
        {canControl && (
          <div className="flex items-center gap-2">
            {selectedItems.length > 0 && (
              <DeleteBackupsDialog
                serverId={serverId}
                vmid={vmid}
                items={selectedItems}
                onDone={load}
              />
            )}
            <CreateBackupDialog
              serverId={serverId}
              vmid={vmid}
              storages={storages}
              onDone={load}
            />
          </div>
        )}
      </div>

      {backups.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Keine Backups vorhanden.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {canControl && <TableHead className="w-8" />}
              <TableHead>Datei</TableHead>
              <TableHead>Storage</TableHead>
              <TableHead>Größe</TableHead>
              <TableHead>Erstellt</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {backups.map((b) => (
              <TableRow key={b.volid}>
                {canControl && (
                  <TableCell
                    className="cursor-pointer"
                    onClick={() => toggle(b.volid, !selected.has(b.volid))}
                  >
                    <Checkbox
                      checked={selected.has(b.volid)}
                      onCheckedChange={(c) => toggle(b.volid, !!c)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </TableCell>
                )}
                <TableCell className="max-w-72 truncate font-medium" title={b.volid}>
                  {b.volid.split("/").pop()}
                </TableCell>
                <TableCell className="text-muted-foreground">{b.storage}</TableCell>
                <TableCell className="text-muted-foreground">{formatSize(b.sizeBytes)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {b.timestamp ? new Date(b.timestamp).toLocaleString("de-DE") : "–"}
                </TableCell>
                <TableCell className="text-right">
                  {canControl && (
                    <RestoreDialog serverId={serverId} vmid={vmid} backup={b} onDone={load} />
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

const STORAGE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

function CreateBackupDialog({
  serverId,
  vmid,
  storages,
  onDone,
}: {
  serverId: string;
  vmid: number;
  storages: string[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [storage, setStorage] = useState(storages[0] ?? "");
  const [mode, setMode] = useState<"snapshot" | "suspend" | "stop">("snapshot");
  const [compress, setCompress] = useState<"zstd" | "gzip" | "lzo" | "0">("zstd");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!storage && storages.length > 0) setStorage(storages[0]);
  }, [storages, storage]);

  async function create() {
    if (!STORAGE_ID_PATTERN.test(storage)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/vms/${vmid}/backups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storage, mode, compress }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Backup fehlgeschlagen");
        return;
      }
      toast.success("Backup erstellt");
      setOpen(false);
      onDone();
    } catch {
      toast.error("Verbindung zum Server fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <DatabaseBackup className="size-4" />
            Backup erstellen
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Backup erstellen</DialogTitle>
          <DialogDescription>
            Startet ein vzdump-Backup dieser VM/LXC. Kann je nach Größe mehrere Minuten dauern.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Storage</Label>
            {storages.length === 0 ? (
              <p className="text-xs text-destructive">
                Kein Backup-fähiges Storage auf diesem Knoten gefunden.
              </p>
            ) : (
              <Select value={storage} onValueChange={(v) => setStorage(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {storages.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Modus</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="snapshot">Snapshot (kein Downtime)</SelectItem>
                <SelectItem value="suspend">Suspend</SelectItem>
                <SelectItem value="stop">Stop (kurzzeitig gestoppt)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Kompression</Label>
            <Select value={compress} onValueChange={(v) => setCompress(v as typeof compress)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zstd">zstd</SelectItem>
                <SelectItem value="gzip">gzip</SelectItem>
                <SelectItem value="lzo">lzo</SelectItem>
                <SelectItem value="0">Keine</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={loading || !storage} onClick={create}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            Backup starten
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteBackupsDialog({
  serverId,
  vmid,
  items,
  onDone,
}: {
  serverId: string;
  vmid: number;
  items: { storage: string; volid: string }[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function remove() {
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/vms/${vmid}/backups/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Löschen fehlgeschlagen");
        return;
      }
      const { ok, failed } = data.results as {
        ok: string[];
        failed: { volid: string; error: string }[];
      };
      if (failed.length === 0) {
        toast.success(`${ok.length} Backup${ok.length === 1 ? "" : "s"} gelöscht`);
      } else {
        toast.error(
          `${ok.length}/${items.length} gelöscht, ${failed.length} Fehler: ${failed
            .map((f) => `${f.volid.split("/").pop()} – ${f.error}`)
            .join("; ")}`
        );
      }
      setOpen(false);
      onDone();
    } catch {
      toast.error("Verbindung zum Server fehlgeschlagen");
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
            {items.length} löschen
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {items.length} Backup{items.length === 1 ? "" : "s"} löschen?
          </DialogTitle>
          <DialogDescription>
            {items.map((i) => i.volid.split("/").pop()).join(", ")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="destructive" disabled={loading} onClick={remove}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            Löschen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RestoreDialog({
  serverId,
  vmid,
  backup,
  onDone,
}: {
  serverId: string;
  vmid: number;
  backup: ProxmoxBackupDTO;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<"inplace" | "new">("inplace");
  const [newVmid, setNewVmid] = useState("");
  const [loading, setLoading] = useState(false);

  const newVmidNum = Number(newVmid);
  const newVmidValid = target === "inplace" || (Number.isInteger(newVmidNum) && newVmidNum > 0);

  async function restore() {
    if (!newVmidValid) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/vms/${vmid}/backups/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storage: backup.storage,
          volid: backup.volid,
          target,
          newVmid: target === "new" ? newVmidNum : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Restore fehlgeschlagen");
        return;
      }
      toast.success(
        target === "inplace"
          ? "VM/LXC aus Backup wiederhergestellt"
          : `Neue VM/LXC #${data.vmid} aus Backup erstellt`
      );
      setOpen(false);
      setNewVmid("");
      setTarget("inplace");
      onDone();
    } catch {
      toast.error("Verbindung zum Server fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" className="size-6" title="Wiederherstellen">
            <ArchiveRestore className="size-3.5" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Backup wiederherstellen?</DialogTitle>
          <DialogDescription>
            {backup.volid.split("/").pop()}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Ziel</Label>
            <Select value={target} onValueChange={(v) => setTarget(v as typeof target)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inplace">
                  Überschreibt VM/LXC #{vmid} (muss gestoppt sein)
                </SelectItem>
                <SelectItem value="new">Als neue VM/LXC wiederherstellen</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {target === "inplace" && (
            <p className="text-xs text-destructive">
              Der aktuelle Zustand von VM/LXC #{vmid} geht dabei unwiderruflich verloren.
            </p>
          )}
          {target === "new" && (
            <div className="space-y-1.5">
              <Label htmlFor="restore-new-vmid">Neue VMID</Label>
              <Input
                id="restore-new-vmid"
                inputMode="numeric"
                value={newVmid}
                onChange={(e) => setNewVmid(e.target.value)}
                placeholder="z.B. 999"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="destructive" disabled={loading || !newVmidValid} onClick={restore}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            Wiederherstellen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
