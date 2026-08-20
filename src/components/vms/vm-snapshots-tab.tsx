"use client";

import { useCallback, useEffect, useState } from "react";
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
          {snapshots.length} Snapshot{snapshots.length === 1 ? "" : "s"}
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
          Keine Snapshots vorhanden.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {canControl && <TableHead className="w-8" />}
              <TableHead>Name</TableHead>
              <TableHead>Beschreibung</TableHead>
              <TableHead>Erstellt</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {snapshots.map((snap) => (
              <TableRow key={snap.name}>
                {canControl && (
                  <TableCell>
                    <Checkbox
                      checked={selected.has(snap.name)}
                      onCheckedChange={(c) => toggle(snap.name, !!c)}
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
                  {snap.timestamp ? new Date(snap.timestamp).toLocaleString("de-DE") : "–"}
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
        toast.error(data.error ?? "Snapshot konnte nicht erstellt werden");
        return;
      }
      toast.success("Snapshot erstellt");
      setOpen(false);
      setName("");
      setDescription("");
      setVmstate(false);
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
            <Camera className="size-4" />
            Snapshot erstellen
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Snapshot erstellen</DialogTitle>
          <DialogDescription>Legt einen neuen Snapshot dieser VM/LXC an.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="snap-name">Name</Label>
            <Input
              id="snap-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="vor-update"
            />
            {name.length > 0 && !nameValid && (
              <p className="text-xs text-destructive">
                Nur Buchstaben, Zahlen, _ und -, muss mit Buchstabe beginnen.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="snap-desc">Beschreibung (optional)</Label>
            <Input
              id="snap-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {vmType === "QEMU" && (
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="snap-vmstate">Arbeitsspeicher-Zustand einschließen</Label>
                <p className="text-xs text-muted-foreground">
                  Größerer, langsamerer Snapshot, ermöglicht Resume aus dem RAM-Zustand
                </p>
              </div>
              <Switch id="snap-vmstate" checked={vmstate} onCheckedChange={(c) => setVmstate(!!c)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button disabled={loading || !nameValid} onClick={create}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            Erstellen
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
        toast.error(data.error ?? "Löschen fehlgeschlagen");
        return;
      }
      const { ok, failed } = data.results as { ok: string[]; failed: { name: string; error: string }[] };
      if (failed.length === 0) {
        toast.success(`${ok.length} Snapshot${ok.length === 1 ? "" : "s"} gelöscht`);
      } else {
        toast.error(
          `${ok.length}/${names.length} gelöscht, ${failed.length} Fehler: ${failed
            .map((f) => `${f.name} – ${f.error}`)
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
            {names.length} löschen
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{names.length} Snapshot{names.length === 1 ? "" : "s"} löschen?</DialogTitle>
          <DialogDescription>
            {names.join(", ")}
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
        toast.error(data.error ?? "Rollback fehlgeschlagen");
        return;
      }
      toast.success("Rollback ausgeführt");
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
          <Button variant="ghost" size="icon" className="size-6" title="Wiederherstellen">
            <History className="size-3.5" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Auf Snapshot zurücksetzen?</DialogTitle>
          <DialogDescription>
            Der aktuelle Zustand der VM/LXC geht verloren und wird durch „{name}“ ersetzt.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="destructive" disabled={loading} onClick={rollback}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            Zurücksetzen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
