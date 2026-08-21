"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ServerFormDialog } from "@/components/servers/server-form-dialog";
import { ServerCard } from "@/components/servers/server-card";
import { Server as ServerIcon } from "lucide-react";
import { useLiveEvents } from "@/hooks/use-live-events";
import { useSession } from "@/hooks/use-session";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { ServerDTO } from "@/lib/types";

export default function ServersPage() {
  const t = useTranslations("servers.page");
  const [servers, setServers] = useState<ServerDTO[] | null>(null);
  const session = useSession();
  const confirm = useConfirm();
  const canEdit = session?.role === "EDITOR" || session?.role === "ADMIN";
  const canDelete = session?.role === "ADMIN";

  const load = useCallback(async () => {
    const res = await fetch("/api/servers");
    if (res.ok) {
      const data = await res.json();
      setServers(data.servers);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/servers")
      .then((res) => (res.ok ? res.json() : { servers: [] }))
      .then((data) => {
        if (active) setServers(data.servers);
      });
    return () => {
      active = false;
    };
  }, []);

  useLiveEvents((event) => {
    if (event.type === "server-status") {
      setServers((prev) =>
        prev
          ? prev.map((s) =>
              s.id === event.serverId
                ? { ...s, lastStatus: event.status as ServerDTO["lastStatus"] }
                : s
            )
          : prev
      );
    }
  });

  async function deleteServer(id: string) {
    if (
      !(await confirm({
        title: t("deleteServerTitle"),
        description: t("deleteServerConfirm"),
        confirmText: t("delete"),
        variant: "destructive",
      }))
    ) {
      return;
    }
    const res = await fetch(`/api/servers/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(t("serverDeleted"));
      load();
    } else {
      const data = await res.json();
      toast.error(data.error ?? t("deleteFailed"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
        {canEdit && <ServerFormDialog onSaved={load} />}
      </div>

      {servers === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : servers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ServerIcon className="size-10 text-muted-foreground" />
            <p className="text-muted-foreground">{t("noServersYet")}</p>
            {canEdit && <ServerFormDialog onSaved={load} />}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              canEdit={canEdit}
              canDelete={canDelete}
              onSaved={load}
              onDelete={deleteServer}
            />
          ))}
        </div>
      )}
    </div>
  );
}
