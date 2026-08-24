"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { VmRow } from "@/components/vms/vm-row";
import { Boxes, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useLiveEvents } from "@/hooks/use-live-events";
import { useSession } from "@/hooks/use-session";
import type { ProxmoxVmWithServerDTO } from "@/lib/types";

export function VmsOverview() {
  const t = useTranslations("vms.overview");
  const [vms, setVms] = useState<ProxmoxVmWithServerDTO[] | null>(null);
  const [search, setSearch] = useState("");
  const [polling, setPolling] = useState(false);
  const session = useSession();
  const canControl = session?.role === "EDITOR" || session?.role === "ADMIN";

  const load = useCallback(async () => {
    const res = await fetch("/api/vms");
    const data = res.ok ? await res.json() : { vms: [] };
    setVms(data.vms);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function pollNow() {
    setPolling(true);
    try {
      const res = await fetch("/api/vms/poll-now", { method: "POST" });
      if (res.ok) await load();
      else toast.error(t("pollFailed"));
    } finally {
      setPolling(false);
    }
  }

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
            {t("subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
          <Button variant="outline" size="sm" disabled={polling} onClick={pollNow}>
            <RefreshCw className={`size-4 ${polling ? "animate-spin" : ""}`} />
            {t("pollNow")}
          </Button>
        </div>
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
              {t("emptyState")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-2 pt-6">
              <h2 className="text-sm font-medium text-muted-foreground">
                {t("virtualMachines", { count: qemu.length })}
              </h2>
              {qemu.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noMatches")}</p>
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
                {t("lxcContainers", { count: lxc.length })}
              </h2>
              {lxc.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noMatches")}</p>
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
