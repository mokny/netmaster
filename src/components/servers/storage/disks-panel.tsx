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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { usePrompt } from "@/components/ui/prompt-dialog";
import { useSession } from "@/hooks/use-session";
import { Loader2, RefreshCw, HardDrive, Layers, Trash2 } from "lucide-react";

interface BlockDevice {
  name: string;
  kname: string;
  path: string;
  type: string;
  size: number | null;
  fstype: string | null;
  mountpoint: string | null;
  uuid: string | null;
  label: string | null;
  model: string | null;
  rota: boolean;
  pkname: string | null;
  children?: BlockDevice[];
}

interface FlatRow extends BlockDevice {
  depth: number;
  parentPath: string | null;
}

function flatten(devices: BlockDevice[], depth = 0, parentPath: string | null = null): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const d of devices) {
    rows.push({ ...d, depth, parentPath });
    if (d.children?.length) rows.push(...flatten(d.children, depth + 1, d.path));
  }
  return rows;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

function partitionNumber(row: FlatRow): number | null {
  const parentName = row.parentPath?.split("/").pop() ?? "";
  if (!row.name.startsWith(parentName)) return null;
  const rest = row.name.slice(parentName.length).replace(/^p/, "");
  const num = Number(rest);
  return Number.isInteger(num) && num > 0 ? num : null;
}

class ApiRequestError extends Error {
  constructor(public code: string, public detail?: string) {
    super(code);
  }
}

function formatError(
  err: unknown,
  tErrors: (key: string) => string,
  fallback: string
): string {
  const code = err instanceof Error ? err.message : "";
  const message = code ? (tErrors(code) ?? fallback) : fallback;
  const detail = err instanceof ApiRequestError ? err.detail : undefined;
  return detail ? `${message}: ${detail}` : message;
}

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiRequestError(data.error ?? "ERROR", data.detail);
  return data;
}

const FILESYSTEMS = ["ext4", "xfs", "btrfs", "ntfs", "exfat"] as const;

export function DisksPanel({ serverId }: { serverId: string }) {
  const t = useTranslations("servers.storage.disks");
  const tErrors = useTranslations("errors");
  const session = useSession();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const canEdit = session?.role === "EDITOR" || session?.role === "ADMIN";

  const [rows, setRows] = useState<FlatRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [smart, setSmart] = useState<Record<string, string>>({});
  const [lvm, setLvm] = useState<{ pvs: Record<string, string>[]; vgs: Record<string, string>[]; lvs: Record<string, string>[] } | null>(null);
  const [mdstat, setMdstat] = useState<string>("");

  function fail(err: unknown, fallback: string) {
    toast.error(formatError(err, tErrors, fallback));
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(`/api/servers/${serverId}/storage/disks`);
      setRows(flatten(data.devices ?? []));
    } catch (err) {
      fail(err, t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  const loadLvm = useCallback(async () => {
    try {
      const data = await api(`/api/servers/${serverId}/storage/lvm`);
      setLvm(data);
    } catch {
      // best effort
    }
  }, [serverId]);

  const loadRaid = useCallback(async () => {
    try {
      const data = await api(`/api/servers/${serverId}/storage/raid`);
      setMdstat(data.mdstat ?? "");
    } catch {
      // best effort
    }
  }, [serverId]);

  useEffect(() => {
    load();
    loadLvm();
    loadRaid();
  }, [load, loadLvm, loadRaid]);

  async function checkSmart(path: string) {
    try {
      const data = await api(`/api/servers/${serverId}/storage/disks/smart?device=${encodeURIComponent(path)}`);
      const label = !data.supported
        ? t("smartUnsupported")
        : data.healthy === false
          ? t("smartFailing")
          : t("smartOk", { temp: data.temperatureC ?? "?" });
      setSmart((s) => ({ ...s, [path]: label }));
    } catch (err) {
      fail(err, t("smartFailed"));
    }
  }

  async function unmount(row: FlatRow) {
    if (!row.mountpoint) return;
    if (!(await confirm({ title: t("unmountTitle"), description: t("unmountDescription", { path: row.mountpoint }) })))
      return;
    setBusy(true);
    try {
      await api(`/api/servers/${serverId}/storage/disks/mount`, {
        method: "DELETE",
        body: JSON.stringify({ device: row.path, mountpoint: row.mountpoint }),
      });
      toast.success(t("unmounted"));
      load();
    } catch (err) {
      fail(err, t("unmountFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function deletePartition(row: FlatRow) {
    const num = partitionNumber(row);
    if (!row.parentPath || !num) return;
    const typed = await prompt({
      title: t("deletePartitionTitle"),
      description: t("typeToConfirm", { name: row.path }),
      label: t("devicePath"),
      placeholder: row.path,
    });
    if (typed !== row.path) {
      if (typed !== null) toast.error(t("confirmMismatch"));
      return;
    }
    setBusy(true);
    try {
      await api(`/api/servers/${serverId}/storage/disks/partitions`, {
        method: "DELETE",
        body: JSON.stringify({ device: row.parentPath, partitionNumber: num }),
      });
      toast.success(t("partitionDeleted"));
      load();
    } catch (err) {
      fail(err, t("partitionDeleteFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (!rows) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">{t("loading")}</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colName")}</TableHead>
                <TableHead>{t("colType")}</TableHead>
                <TableHead>{t("colSize")}</TableHead>
                <TableHead>{t("colFs")}</TableHead>
                <TableHead>{t("colMount")}</TableHead>
                {canEdit && <TableHead className="text-right">{t("colActions")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.path}>
                  <TableCell style={{ paddingLeft: `${row.depth * 1.25 + 0.75}rem` }}>
                    <div className="flex items-center gap-2 font-mono text-xs">
                      <HardDrive className="size-3.5 text-muted-foreground" />
                      {row.path}
                    </div>
                    {smart[row.path] && (
                      <p className="mt-1 text-xs text-muted-foreground">{smart[row.path]}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{row.type}</TableCell>
                  <TableCell className="text-xs">{formatSize(row.size)}</TableCell>
                  <TableCell className="text-xs">{row.fstype ?? "-"}</TableCell>
                  <TableCell className="text-xs">
                    {row.mountpoint ? <Badge variant="secondary">{row.mountpoint}</Badge> : "-"}
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {row.type === "disk" && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => checkSmart(row.path)}>
                              SMART
                            </Button>
                            <PartitionTableDialog serverId={serverId} device={row.path} onDone={load} />
                            <PartitionDialog serverId={serverId} device={row.path} onDone={load} />
                          </>
                        )}
                        {row.type !== "disk" && !row.mountpoint && (
                          <>
                            <FormatDialog serverId={serverId} device={row.path} onDone={load} />
                            <MountDialog serverId={serverId} device={row.path} onDone={load} />
                          </>
                        )}
                        {row.mountpoint && (
                          <Button variant="ghost" size="sm" disabled={busy} onClick={() => unmount(row)}>
                            {t("unmount")}
                          </Button>
                        )}
                        {row.type === "part" && row.parentPath && (
                          <Button variant="ghost" size="icon" className="size-7" disabled={busy} onClick={() => deletePartition(row)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <LvmCard serverId={serverId} lvm={lvm} onReload={loadLvm} canEdit={!!canEdit} />
        <RaidCard serverId={serverId} mdstat={mdstat} onReload={loadRaid} canEdit={!!canEdit} />
      </div>
    </div>
  );
}

function PartitionTableDialog({ serverId, device, onDone }: { serverId: string; device: string; onDone: () => void }) {
  const t = useTranslations("servers.storage.disks");
  const tErrors = useTranslations("errors");
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState<"gpt" | "msdos">("gpt");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await api(`/api/servers/${serverId}/storage/disks/partition-table`, {
        method: "POST",
        body: JSON.stringify({ device, label }),
      });
      toast.success(t("partitionTableCreated"));
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error(formatError(err, tErrors, t("partitionTableFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm">
          <Layers className="size-3.5" />
        </Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newPartitionTableTitle")}</DialogTitle>
          <DialogDescription>{t("newPartitionTableDescription", { device })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>{t("partitionTableType")}</Label>
          <Select value={label} onValueChange={(v) => setLabel(v as "gpt" | "msdos")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gpt">GPT</SelectItem>
              <SelectItem value="msdos">MBR</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="destructive" onClick={submit} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PartitionDialog({ serverId, device, onDone }: { serverId: string; device: string; onDone: () => void }) {
  const t = useTranslations("servers.storage.disks");
  const tErrors = useTranslations("errors");
  const [open, setOpen] = useState(false);
  const [fsHint, setFsHint] = useState<(typeof FILESYSTEMS)[number]>("ext4");
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState("100");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await api(`/api/servers/${serverId}/storage/disks/partitions`, {
        method: "POST",
        body: JSON.stringify({ device, fsHint, startPercent: Number(start), endPercent: Number(end) }),
      });
      toast.success(t("partitionCreated"));
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error(formatError(err, tErrors, t("partitionFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm">
          {t("newPartition")}
        </Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newPartitionTitle")}</DialogTitle>
          <DialogDescription>{device}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>{t("startPercent")}</Label>
            <Input type="number" min={0} max={100} value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("endPercent")}</Label>
            <Input type="number" min={0} max={100} value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t("filesystemHint")}</Label>
          <Select value={fsHint} onValueChange={(v) => setFsHint(v as (typeof FILESYSTEMS)[number])}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILESYSTEMS.map((fs) => (
                <SelectItem key={fs} value={fs}>
                  {fs}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormatDialog({ serverId, device, onDone }: { serverId: string; device: string; onDone: () => void }) {
  const t = useTranslations("servers.storage.disks");
  const tErrors = useTranslations("errors");
  const prompt = usePrompt();
  const [open, setOpen] = useState(false);
  const [fstype, setFstype] = useState<(typeof FILESYSTEMS)[number]>("ext4");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const typed = await prompt({
      title: t("formatConfirmTitle"),
      description: t("typeToConfirm", { name: device }),
      label: t("devicePath"),
      placeholder: device,
    });
    if (typed !== device) {
      if (typed !== null) toast.error(t("confirmMismatch"));
      return;
    }
    setSaving(true);
    try {
      await api(`/api/servers/${serverId}/storage/disks/format`, {
        method: "POST",
        body: JSON.stringify({ device, fstype, label }),
      });
      toast.success(t("formatted"));
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error(formatError(err, tErrors, t("formatFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm">
          {t("format")}
        </Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("formatTitle")}</DialogTitle>
          <DialogDescription>{device}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>{t("filesystem")}</Label>
          <Select value={fstype} onValueChange={(v) => setFstype(v as (typeof FILESYSTEMS)[number])}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILESYSTEMS.map((fs) => (
                <SelectItem key={fs} value={fs}>
                  {fs}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t("volumeLabel")}</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="destructive" onClick={submit} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {t("format")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MountDialog({ serverId, device, onDone }: { serverId: string; device: string; onDone: () => void }) {
  const t = useTranslations("servers.storage.disks");
  const tErrors = useTranslations("errors");
  const [open, setOpen] = useState(false);
  const [mountpoint, setMountpoint] = useState("/mnt/");
  const [options, setOptions] = useState("defaults");
  const [autoMount, setAutoMount] = useState(true);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await api(`/api/servers/${serverId}/storage/disks/mount`, {
        method: "POST",
        body: JSON.stringify({ device, mountpoint, options, autoMount }),
      });
      toast.success(t("mounted"));
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error(formatError(err, tErrors, t("mountFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm">
          {t("mount")}
        </Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("mountTitle")}</DialogTitle>
          <DialogDescription>{device}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>{t("mountpoint")}</Label>
          <Input value={mountpoint} onChange={(e) => setMountpoint(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t("mountOptions")}</Label>
          <Input value={options} onChange={(e) => setOptions(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={`automount-${device}`}
            checked={autoMount}
            onCheckedChange={(v) => setAutoMount(v === true)}
          />
          <Label htmlFor={`automount-${device}`} className="font-normal">
            {t("autoMountOnBoot")}
          </Label>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {t("mount")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LvmCard({
  serverId,
  lvm,
  onReload,
  canEdit,
}: {
  serverId: string;
  lvm: { pvs: Record<string, string>[]; vgs: Record<string, string>[]; lvs: Record<string, string>[] } | null;
  onReload: () => void;
  canEdit: boolean;
}) {
  const t = useTranslations("servers.storage.lvm");
  const tErrors = useTranslations("errors");
  const confirm = useConfirm();
  const [pvDevice, setPvDevice] = useState("");
  const [vgName, setVgName] = useState("");
  const [vgDevices, setVgDevices] = useState("");
  const [lvVg, setLvVg] = useState("");
  const [lvName, setLvName] = useState("");
  const [lvSize, setLvSize] = useState("");
  const [extendVg, setExtendVg] = useState("");
  const [extendLv, setExtendLv] = useState("");
  const [extendSize, setExtendSize] = useState("");
  const [extendFs, setExtendFs] = useState<"ext4" | "xfs" | "btrfs">("ext4");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, successMsg: string, failMsg: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(successMsg);
      onReload();
    } catch (err) {
      toast.error(formatError(err, tErrors, failMsg));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>LVM</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <p className="mb-1 font-medium">{t("volumeGroups")}</p>
          {lvm?.vgs.length ? (
            <ul className="space-y-1">
              {lvm.vgs.map((vg) => (
                <li key={vg.vg_name} className="flex items-center justify-between">
                  <span className="font-mono text-xs">{vg.vg_name} ({vg.vg_free} {t("free")})</span>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => api(`/api/servers/${serverId}/storage/lvm/vg`, { method: "DELETE", body: JSON.stringify({ name: vg.vg_name }) }),
                          t("vgRemoved"),
                          t("vgRemoveFailed")
                        )
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{t("none")}</p>
          )}
        </div>
        <div>
          <p className="mb-1 font-medium">{t("logicalVolumes")}</p>
          {lvm?.lvs.length ? (
            <ul className="space-y-1">
              {lvm.lvs.map((lv) => (
                <li key={lv.lv_path} className="flex items-center justify-between">
                  <span className="font-mono text-xs">{lv.lv_path} ({lv.lv_size})</span>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          !(await confirm({
                            title: t("lvRemoveTitle"),
                            description: t("lvRemoveDescription", { path: lv.lv_path }),
                            variant: "destructive",
                          }))
                        )
                          return;
                        run(
                          () =>
                            api(`/api/servers/${serverId}/storage/lvm/lv`, {
                              method: "DELETE",
                              body: JSON.stringify({ vg: lv.vg_name, lv: lv.lv_name }),
                            }),
                          t("lvRemoved"),
                          t("lvRemoveFailed")
                        );
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{t("none")}</p>
          )}
        </div>

        {canEdit && (
          <div className="space-y-3 border-t pt-3">
            <div className="flex gap-2">
              <Input placeholder="/dev/sdb" value={pvDevice} onChange={(e) => setPvDevice(e.target.value)} />
              <Button
                variant="outline"
                disabled={busy || !pvDevice}
                onClick={() =>
                  run(
                    () => api(`/api/servers/${serverId}/storage/lvm/pv`, { method: "POST", body: JSON.stringify({ device: pvDevice }) }),
                    t("pvCreated"),
                    t("pvCreateFailed")
                  )
                }
              >
                {t("createPv")}
              </Button>
            </div>
            <div className="flex gap-2">
              <Input placeholder={t("vgNamePlaceholder")} value={vgName} onChange={(e) => setVgName(e.target.value)} />
              <Input placeholder="/dev/sdb /dev/sdc" value={vgDevices} onChange={(e) => setVgDevices(e.target.value)} />
              <Button
                variant="outline"
                disabled={busy || !vgName || !vgDevices}
                onClick={() =>
                  run(
                    () =>
                      api(`/api/servers/${serverId}/storage/lvm/vg`, {
                        method: "POST",
                        body: JSON.stringify({ name: vgName, devices: vgDevices.split(/\s+/).filter(Boolean) }),
                      }),
                    t("vgCreated"),
                    t("vgCreateFailed")
                  )
                }
              >
                {t("createVg")}
              </Button>
            </div>
            <div className="flex gap-2">
              <Input placeholder={t("vgNamePlaceholder")} value={lvVg} onChange={(e) => setLvVg(e.target.value)} />
              <Input placeholder={t("lvNamePlaceholder")} value={lvName} onChange={(e) => setLvName(e.target.value)} />
              <Input placeholder="10G / 100%FREE" value={lvSize} onChange={(e) => setLvSize(e.target.value)} />
              <Button
                variant="outline"
                disabled={busy || !lvVg || !lvName || !lvSize}
                onClick={() =>
                  run(
                    () =>
                      api(`/api/servers/${serverId}/storage/lvm/lv`, {
                        method: "POST",
                        body: JSON.stringify({ vg: lvVg, lv: lvName, size: lvSize }),
                      }),
                    t("lvCreated"),
                    t("lvCreateFailed")
                  )
                }
              >
                {t("createLv")}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 border-t pt-3">
              <Input className="w-24" placeholder={t("vgNamePlaceholder")} value={extendVg} onChange={(e) => setExtendVg(e.target.value)} />
              <Input className="w-24" placeholder={t("lvNamePlaceholder")} value={extendLv} onChange={(e) => setExtendLv(e.target.value)} />
              <Input className="w-20" placeholder="+10G" value={extendSize} onChange={(e) => setExtendSize(e.target.value)} />
              <Select value={extendFs} onValueChange={(v) => setExtendFs(v as "ext4" | "xfs" | "btrfs")}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ext4">ext4</SelectItem>
                  <SelectItem value="xfs">xfs</SelectItem>
                  <SelectItem value="btrfs">btrfs</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                disabled={busy || !extendVg || !extendLv || !extendSize}
                onClick={() =>
                  run(
                    () =>
                      api(`/api/servers/${serverId}/storage/lvm/lv`, {
                        method: "PATCH",
                        body: JSON.stringify({ vg: extendVg, lv: extendLv, addSize: extendSize, fstype: extendFs }),
                      }),
                    t("lvExtended"),
                    t("lvExtendFailed")
                  )
                }
              >
                {t("extendLv")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const RAID_LEVELS = ["0", "1", "5", "6", "10"] as const;

function RaidCard({
  serverId,
  mdstat,
  onReload,
  canEdit,
}: {
  serverId: string;
  mdstat: string;
  onReload: () => void;
  canEdit: boolean;
}) {
  const t = useTranslations("servers.storage.raid");
  const tErrors = useTranslations("errors");
  const prompt = usePrompt();
  const [mdDevice, setMdDevice] = useState("/dev/md0");
  const [level, setLevel] = useState<(typeof RAID_LEVELS)[number]>("1");
  const [devices, setDevices] = useState("");
  const [growDevices, setGrowDevices] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      await api(`/api/servers/${serverId}/storage/raid`, {
        method: "POST",
        body: JSON.stringify({ mdDevice, level, devices: devices.split(/\s+/).filter(Boolean) }),
      });
      toast.success(t("created"));
      onReload();
    } catch (err) {
      toast.error(formatError(err, tErrors, t("createFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function grow() {
    const name = mdDevice.replace("/dev/", "");
    setBusy(true);
    try {
      await api(`/api/servers/${serverId}/storage/raid/${encodeURIComponent(name)}`, {
        method: "PATCH",
        body: JSON.stringify({ addDevices: growDevices.split(/\s+/).filter(Boolean) }),
      });
      toast.success(t("grown"));
      setGrowDevices("");
      onReload();
    } catch (err) {
      toast.error(formatError(err, tErrors, t("growFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    const typed = await prompt({
      title: t("stopTitle"),
      description: t("typeToConfirm", { name: mdDevice }),
      label: t("raidDevice"),
      placeholder: mdDevice,
    });
    if (typed !== mdDevice) {
      if (typed !== null) toast.error(t("confirmMismatch"));
      return;
    }
    const name = mdDevice.replace("/dev/", "");
    setBusy(true);
    try {
      await api(`/api/servers/${serverId}/storage/raid/${encodeURIComponent(name)}`, { method: "DELETE" });
      toast.success(t("stopped"));
      onReload();
    } catch (err) {
      toast.error(formatError(err, tErrors, t("stopFailed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs">{mdstat || t("noArrays")}</pre>
        {canEdit && (
          <div className="space-y-2 border-t pt-3">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="/dev/md0" value={mdDevice} onChange={(e) => setMdDevice(e.target.value)} />
              <Select value={level} onValueChange={(v) => setLevel(v as (typeof RAID_LEVELS)[number])}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RAID_LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>
                      RAID {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input placeholder="/dev/sdb /dev/sdc" value={devices} onChange={(e) => setDevices(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="outline" disabled={busy || !mdDevice || !devices} onClick={create}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                {t("create")}
              </Button>
              <Button variant="destructive" disabled={busy || !mdDevice} onClick={stop}>
                {t("stop")}
              </Button>
            </div>
            <div className="flex gap-2 border-t pt-2">
              <Input placeholder="/dev/sdd" value={growDevices} onChange={(e) => setGrowDevices(e.target.value)} />
              <Button variant="outline" disabled={busy || !mdDevice || !growDevices} onClick={grow}>
                {t("grow")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
