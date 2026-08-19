"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLiveEvents } from "@/hooks/use-live-events";
import type { ProxmoxVmWithServerDTO } from "@/lib/types";

const RUNNING_STATES = new Set(["running"]);

export function ProxmoxGlobalWidget() {
  const [vms, setVms] = useState<ProxmoxVmWithServerDTO[] | null>(null);

  useEffect(() => {
    fetch("/api/vms")
      .then((res) => (res.ok ? res.json() : { vms: [] }))
      .then((data) => setVms(data.vms ?? []));
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

  const byHost = useMemo(() => {
    if (!vms) return [];
    const map = new Map<string, { serverId: string; serverName: string; vms: ProxmoxVmWithServerDTO[] }>();
    for (const vm of vms) {
      const entry = map.get(vm.serverId) ?? { serverId: vm.serverId, serverName: vm.serverName, vms: [] };
      entry.vms.push(vm);
      map.set(vm.serverId, entry);
    }
    return [...map.values()].sort((a, b) => a.serverName.localeCompare(b.serverName));
  }, [vms]);

  if (!vms) {
    return <p className="text-sm text-muted-foreground">Lädt…</p>;
  }

  const running = vms.filter((v) => RUNNING_STATES.has(v.status)).length;
  const stopped = vms.length - running;
  const qemu = vms.filter((v) => v.type === "QEMU").length;
  const lxc = vms.filter((v) => v.type === "LXC").length;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <div className="rounded-md border p-2">
          <p className="text-lg font-semibold">{running}</p>
          <p className="text-muted-foreground">Laufend</p>
        </div>
        <div className="rounded-md border p-2">
          <p className="text-lg font-semibold">{stopped}</p>
          <p className="text-muted-foreground">Gestoppt</p>
        </div>
        <div className="rounded-md border p-2">
          <p className="text-lg font-semibold">{qemu}</p>
          <p className="text-muted-foreground">VMs</p>
        </div>
        <div className="rounded-md border p-2">
          <p className="text-lg font-semibold">{lxc}</p>
          <p className="text-muted-foreground">LXC</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {byHost.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Proxmox-Hosts gefunden.</p>
        ) : (
          <ul className="space-y-1">
            {byHost.map((host) => {
              const hostRunning = host.vms.filter((v) => RUNNING_STATES.has(v.status)).length;
              return (
                <li key={host.serverId}>
                  <Link
                    href={`/servers/${host.serverId}`}
                    className="flex items-center justify-between rounded-md px-2 py-1 text-sm hover:bg-accent"
                  >
                    <span className="truncate">{host.serverName}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {hostRunning}/{host.vms.length} laufend
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
