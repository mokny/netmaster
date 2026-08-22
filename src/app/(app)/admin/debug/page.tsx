"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Bug } from "lucide-react";
import type { ServerDTO } from "@/lib/types";

export default function AdminDebugPage() {
  const [servers, setServers] = useState<ServerDTO[] | null>(null);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Poll debug</h1>
        <p className="text-sm text-muted-foreground">
          CPU/RAM/Disk je Server mit Poll-Zeitpunkten als vertikale Marker. Server auswählen.
        </p>
      </div>

      {servers === null ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : servers.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Keine Server vorhanden.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {servers.map((s) => (
            <Link
              key={s.id}
              href={`/admin/debug/${s.id}`}
              className="flex items-center gap-3 rounded-md border px-4 py-3 text-sm hover:bg-accent"
            >
              <Bug className="size-4 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate font-medium">{s.name}</p>
                <p className="truncate text-xs text-muted-foreground">{s.hostname}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
