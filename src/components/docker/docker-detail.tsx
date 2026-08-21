"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DockerPowerDialog } from "@/components/docker/docker-power-dialog";
import { MetricChart, type ChartPoint } from "@/components/servers/metric-chart";
import { FileManagerTab } from "@/components/servers/file-manager/file-manager-tab";
import { useLiveEvents } from "@/hooks/use-live-events";
import { useSession } from "@/hooks/use-session";
import { useTerminalManager } from "@/hooks/use-terminal-manager";
import { ArrowLeft, Play, Square, RotateCw, TerminalSquare } from "lucide-react";

interface ContainerSample {
  timestamp: string;
  cpuPercent: number | null;
  memUsageMb: number | null;
  netRxMb: number | null;
  netTxMb: number | null;
}

interface ContainerDetail extends ContainerSample {
  containerId: string;
  name: string;
  image: string;
  state: string;
  ips: string[];
  server: { id: string; name: string };
}

const RUNNING_STATES = new Set(["running"]);

export function DockerDetail({
  serverId,
  containerId,
}: {
  serverId: string;
  containerId: string;
}) {
  const session = useSession();
  const canControl = session?.role === "EDITOR" || session?.role === "ADMIN";
  const { openDockerExec } = useTerminalManager();

  const [container, setContainer] = useState<ContainerDetail | null>(null);
  const [samples, setSamples] = useState<ContainerSample[]>([]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/servers/${serverId}/containers/${containerId}?hours=6`);
    if (res.ok) {
      const data = await res.json();
      setContainer(data.container);
      setSamples(data.samples);
    }
  }, [serverId, containerId]);

  useEffect(() => {
    load();
  }, [load]);

  useLiveEvents((event) => {
    if (event.type !== "docker" || event.serverId !== serverId) return;
    const updated = (
      event.containers as Array<{
        containerId: string;
        name: string;
        image: string;
        state: string;
        cpuPercent: number | null;
        memUsageMb: number | null;
        netRxMb: number | null;
        netTxMb: number | null;
        ips: string[];
      }>
    ).find((c) => c.containerId === containerId);
    if (!updated) return;
    setContainer((prev) => (prev ? { ...prev, ...updated } : prev));
    const sample: ContainerSample = {
      timestamp: new Date().toISOString(),
      cpuPercent: updated.cpuPercent,
      memUsageMb: updated.memUsageMb,
      netRxMb: updated.netRxMb,
      netTxMb: updated.netTxMb,
    };
    setSamples((prev) => [...prev, sample].slice(-2000));
  });

  if (!container) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const running = RUNNING_STATES.has(container.state);
  const cpuPoints: ChartPoint[] = samples.map((s) => ({
    timestamp: s.timestamp,
    value: s.cpuPercent,
  }));
  const memPoints: ChartPoint[] = samples.map((s) => ({
    timestamp: s.timestamp,
    value: s.memUsageMb,
  }));
  const netRxPoints: ChartPoint[] = samples.map((s) => ({
    timestamp: s.timestamp,
    value: s.netRxMb,
  }));
  const netTxPoints: ChartPoint[] = samples.map((s) => ({
    timestamp: s.timestamp,
    value: s.netTxMb,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/servers/${serverId}`}
            className={buttonVariants({ variant: "ghost", size: "icon" })}
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{container.name}</h1>
              <Badge variant={running ? "default" : "secondary"} className="capitalize">
                {container.state}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {container.ips.length > 0 ? container.ips.join(", ") : "IP unbekannt"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {container.image} · auf{" "}
              <Link href={`/servers/${container.server.id}`} className="hover:underline">
                {container.server.name}
              </Link>
            </p>
          </div>
        </div>
        {canControl && (
          <div className="flex flex-wrap items-center gap-2">
            {running && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => openDockerExec(serverId, containerId, container.name)}
              >
                <TerminalSquare className="size-4" />
                Terminal
              </Button>
            )}
            {!running && (
              <DockerPowerDialog
                serverId={serverId}
                containerId={containerId}
                containerName={container.name}
                action="start"
                onDone={load}
                trigger={
                  <Button variant="outline" size="sm">
                    <Play className="size-4" />
                    Starten
                  </Button>
                }
              />
            )}
            {running && (
              <>
                <DockerPowerDialog
                  serverId={serverId}
                  containerId={containerId}
                  containerName={container.name}
                  action="restart"
                  onDone={load}
                  trigger={
                    <Button variant="outline" size="sm">
                      <RotateCw className="size-4" />
                      Neu starten
                    </Button>
                  }
                />
                <DockerPowerDialog
                  serverId={serverId}
                  containerId={containerId}
                  containerName={container.name}
                  action="stop"
                  onDone={load}
                  trigger={
                    <Button variant="outline" size="sm">
                      <Square className="size-4" />
                      Stoppen
                    </Button>
                  }
                />
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>CPU</CardTitle>
            <CardDescription>
              {container.cpuPercent != null ? `${container.cpuPercent.toFixed(1)}%` : "–"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MetricChart data={cpuPoints} color="cpu" unit="%" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>RAM</CardTitle>
            <CardDescription>
              {container.memUsageMb != null ? `${container.memUsageMb.toFixed(0)} MB` : "–"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MetricChart data={memPoints} color="mem" unit="MB" domain={["auto", "auto"]} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Netzwerk (Empfang)</CardTitle>
            <CardDescription>
              {container.netRxMb != null ? `${container.netRxMb.toFixed(2)} MB` : "–"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MetricChart data={netRxPoints} color="disk" unit="MB" domain={["auto", "auto"]} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Netzwerk (Senden)</CardTitle>
            <CardDescription>
              {container.netTxMb != null ? `${container.netTxMb.toFixed(2)} MB` : "–"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MetricChart data={netTxPoints} color="disk" unit="MB" domain={["auto", "auto"]} />
          </CardContent>
        </Card>
      </div>

      {canControl && running && (
        <Card>
          <CardHeader>
            <CardTitle>Dateien</CardTitle>
            <CardDescription>
              Zugriff über `docker exec` auf die Host-Verbindung - kein echtes SFTP.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FileManagerTab
              wsPath={`/api/ws/docker-files?serverId=${encodeURIComponent(serverId)}&containerId=${encodeURIComponent(containerId)}`}
              restBasePath={`/api/docker/${serverId}/${containerId}/files`}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
