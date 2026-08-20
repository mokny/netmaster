"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { GlobalCheckDialog } from "@/components/checks/global-check-dialog";
import { Trash2, ExternalLink } from "lucide-react";
import { useLiveEvents } from "@/hooks/use-live-events";
import { useSession } from "@/hooks/use-session";
import type { ServiceCheckDTO } from "@/lib/types";

export function UpcheckerOverview() {
  const [checks, setChecks] = useState<ServiceCheckDTO[] | null>(null);
  const session = useSession();
  const canEdit = session?.role === "EDITOR" || session?.role === "ADMIN";

  const load = useCallback(async () => {
    const res = await fetch("/api/checks");
    if (res.ok) setChecks((await res.json()).checks);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useLiveEvents((event) => {
    if (event.type !== "service-check") return;
    setChecks((prev) =>
      prev
        ? prev.map((c) =>
            c.id === event.serviceCheckId
              ? { ...c, lastStatus: event.status as ServiceCheckDTO["lastStatus"] }
              : c
          )
        : prev
    );
  });

  async function deleteCheck(id: string) {
    const res = await fetch(`/api/checks/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Löschen fehlgeschlagen");
      return;
    }
    setChecks((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Upchecker</h1>
          <p className="text-sm text-muted-foreground">
            Erreichbarkeit von Websites und Diensten per HTTP
          </p>
        </div>
        {canEdit && <GlobalCheckDialog onSaved={load} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Checks</CardTitle>
          <CardDescription>
            Freie Checks und die HTTP-Health-Checks aller Server an einem Ort
          </CardDescription>
        </CardHeader>
        <CardContent>
          {checks === null ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : checks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Checks konfiguriert.</p>
          ) : (
            <div className="space-y-2">
              {checks.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{c.name}</p>
                      {c.serverId && c.serverName && (
                        <Link
                          href={`/servers/${c.serverId}`}
                          className="truncate text-xs text-muted-foreground hover:underline"
                        >
                          {c.serverName}
                        </Link>
                      )}
                    </div>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 truncate text-xs text-muted-foreground hover:underline"
                    >
                      {c.url}
                      <ExternalLink className="size-3 shrink-0" />
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.lastLatencyMs != null && (
                      <span className="text-xs text-muted-foreground">
                        {Math.round(c.lastLatencyMs)}ms
                      </span>
                    )}
                    <StatusBadge status={c.lastStatus} />
                    {canEdit && !c.serverId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        onClick={() => deleteCheck(c.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
