"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { VmRow } from "@/components/vms/vm-row";
import { Boxes } from "lucide-react";
import { useLiveEvents } from "@/hooks/use-live-events";
import { useSession } from "@/hooks/use-session";
import type { ProxmoxVmWithServerDTO } from "@/lib/types";

export function VmsOverview() {
  const [vms, setVms] = useState<ProxmoxVmWithServerDTO[] | null>(null);
  const [search, setSearch] = useState("");
  const session = useSession();
  const canControl = session?.role === "EDITOR" || session?.role === "ADMIN";

  useEffect(() => {
    let active = true;
    fetch("/api/vms")
      .then((res) => (res.ok ? res.json() : { vms: [] }))
      .then((data) => {
        if (active) setVms(data.vms);
      });
    return () => {
      active = false;
    };
  }, []);

  useLiveEvents((event) => {
    if (event.type !== "proxmox") return;
    setVms((prev) => {
      if (!prev) return prev;
      const incoming = event.vms as ProxmoxVmWithServerDTO[];
      const serverName = prev.find((v) => v.serverId === event.serverId)?.serverName ?? "";
      const others = prev.filter((v) => v.serverId !== event.serverId);
      const updated = incoming.map((v) => ({ ...v, serverName: v.serverName ?? serverName }));
      return [...others, ...updated].sort((a, b) => a.name.localeCompare(b.name));
    });
  });

  const filtered = useMemo(() => {
    if (!vms) return [];
    const q = search.trim().toLowerCase();
    if (!q) return vms;
    return vms.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.serverName.toLowerCase().includes(q) ||
        String(v.vmid).includes(q)
    );
  }, [vms, search]);

  const qemu = filtered.filter((v) => v.type === "QEMU");
  const lxc = filtered.filter((v) => v.type === "LXC");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">VMs</h1>
          <p className="text-sm text-muted-foreground">
            Virtuelle Maschinen und LXC-Container aller Proxmox-Hosts.
          </p>
        </div>
        <Input
          placeholder="Suche nach Name, Host oder ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
      </div>

      {vms === null ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : vms.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Boxes className="size-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              Keine Proxmox-VMs/LXC-Container gefunden. Server werden automatisch erkannt, sobald
              sie per SSH erreichbar sind.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-2 pt-6">
              <h2 className="text-sm font-medium text-muted-foreground">
                Virtuelle Maschinen ({qemu.length})
              </h2>
              {qemu.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Treffer.</p>
              ) : (
                qemu.map((vm) => (
                  <VmRow
                    key={vm.id}
                    vm={vm}
                    canControl={canControl}
                    href={`/vms/${vm.serverId}/${vm.vmid}`}
                  />
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 pt-6">
              <h2 className="text-sm font-medium text-muted-foreground">
                LXC-Container ({lxc.length})
              </h2>
              {lxc.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Treffer.</p>
              ) : (
                lxc.map((vm) => (
                  <VmRow
                    key={vm.id}
                    vm={vm}
                    canControl={canControl}
                    href={`/vms/${vm.serverId}/${vm.vmid}`}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
