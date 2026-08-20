"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { DockerRow } from "@/components/docker/docker-row";
import { Container, Layers } from "lucide-react";
import { useLiveEvents } from "@/hooks/use-live-events";
import { useSession } from "@/hooks/use-session";
import type { ContainerWithServerDTO } from "@/lib/types";

export function DockerOverview() {
  const [containers, setContainers] = useState<ContainerWithServerDTO[] | null>(null);
  const [search, setSearch] = useState("");
  const session = useSession();
  const canControl = session?.role === "EDITOR" || session?.role === "ADMIN";

  const load = useCallback(async () => {
    const res = await fetch("/api/containers");
    if (res.ok) setContainers((await res.json()).containers);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useLiveEvents((event) => {
    if (event.type !== "docker") return;
    setContainers((prev) => {
      if (!prev) return prev;
      const serverEntry = prev.find((c) => c.serverId === event.serverId);
      const serverName = serverEntry?.serverName ?? "";
      const incoming = event.containers as Array<{
        containerId: string;
        name: string;
        image: string;
        state: string;
        cpuPercent: number | null;
        memUsageMb: number | null;
        netRxMb: number | null;
        netTxMb: number | null;
      }>;
      const others = prev.filter((c) => c.serverId !== event.serverId);
      const updated = incoming.map((c) => ({
        ...c,
        id: `${event.serverId}-${c.containerId}`,
        serverId: event.serverId,
        serverName,
        timestamp: new Date().toISOString(),
      }));
      return [...others, ...updated].sort((a, b) => a.name.localeCompare(b.name));
    });
  });

  const servers = useMemo(() => {
    if (!containers) return [];
    const map = new Map<string, string>();
    for (const c of containers) map.set(c.serverId, c.serverName);
    return [...map.entries()]
      .map(([serverId, serverName]) => ({ serverId, serverName }))
      .sort((a, b) => a.serverName.localeCompare(b.serverName));
  }, [containers]);

  const filtered = useMemo(() => {
    if (!containers) return [];
    const q = search.trim().toLowerCase();
    if (!q) return containers;
    return containers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.serverName.toLowerCase().includes(q) ||
        c.image.toLowerCase().includes(q)
    );
  }, [containers, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Docker</h1>
          <p className="text-sm text-muted-foreground">
            Container aller Server im Überblick.
          </p>
        </div>
        <Input
          placeholder="Suche nach Name, Server oder Image…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
      </div>

      {servers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {servers.map((s) => (
            <Link key={s.serverId} href={`/docker/${s.serverId}`}>
              <Badge variant="outline" className="gap-1.5 py-1">
                <Layers className="size-3" />
                {s.serverName}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      {containers === null ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Container className="size-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              Keine Docker-Container gefunden. Server werden automatisch erkannt, sobald
              Docker per SSH erreichbar ist.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <DockerRow
              key={`${c.serverId}-${c.containerId}`}
              container={c}
              canControl={canControl}
              href={`/docker/${c.serverId}/${c.containerId}`}
              onDone={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}
