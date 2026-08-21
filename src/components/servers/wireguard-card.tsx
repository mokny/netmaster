"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Network, Settings2 } from "lucide-react";

interface WireguardListResponse {
  installed: boolean;
  interfaces: string[];
}

export function WireguardCard({ serverId }: { serverId: string }) {
  const [state, setState] = useState<WireguardListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/servers/${serverId}/wireguard`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) {
          setError(data.error ?? "Fehler beim Abrufen des WireGuard-Status");
          return;
        }
        setState(data);
      })
      .catch(() => active && setError("Verbindung fehlgeschlagen"));
    return () => {
      active = false;
    };
  }, [serverId]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>WireGuard</CardTitle>
          <CardDescription>VPN-Interfaces und Peers</CardDescription>
        </div>
        <Network className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-red-500">{error}</p>}
        {!error && !state && (
          <p className="text-sm text-muted-foreground">Lade Status…</p>
        )}
        {state && !state.installed && (
          <p className="text-sm text-muted-foreground">
            WireGuard ist auf diesem Server nicht installiert.
          </p>
        )}
        {state && state.installed && state.interfaces.length === 0 && (
          <p className="text-sm text-muted-foreground">
            WireGuard ist installiert, es sind aber noch keine Interfaces angelegt.
          </p>
        )}
        {state && state.installed && state.interfaces.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {state.interfaces.map((name) => (
              <Badge key={name} variant="secondary" className="font-mono">
                {name}
              </Badge>
            ))}
          </div>
        )}
        <Link
          href={`/servers/${serverId}/wireguard`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Settings2 className="size-4" />
          Verwalten
        </Link>
      </CardContent>
    </Card>
  );
}
