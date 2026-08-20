"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DockerPowerDialog } from "@/components/docker/docker-power-dialog";
import { useTerminalManager } from "@/hooks/use-terminal-manager";
import { Play, Square, RotateCw, TerminalSquare } from "lucide-react";
import type { ContainerWithServerDTO } from "@/lib/types";

const RUNNING_STATES = new Set(["running"]);

export function DockerRow({
  container,
  canControl,
  href,
  onDone,
}: {
  container: ContainerWithServerDTO;
  canControl: boolean;
  href?: string;
  onDone?: () => void;
}) {
  const { openDockerExec } = useTerminalManager();
  const running = RUNNING_STATES.has(container.state);

  const name = (
    <div className="min-w-0">
      <p className="truncate font-medium">{container.name}</p>
      <p className="truncate text-xs text-muted-foreground">
        {container.serverName}
        {container.image ? ` · ${container.image}` : ""}
        {container.memUsageMb != null ? ` · ${container.memUsageMb.toFixed(0)} MB RAM` : ""}
      </p>
    </div>
  );

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
      {href ? (
        <Link href={href} className="min-w-0 flex-1 hover:underline">
          {name}
        </Link>
      ) : (
        <div className="min-w-0 flex-1">{name}</div>
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {container.cpuPercent != null && <span>{container.cpuPercent.toFixed(1)}% CPU</span>}
        <Badge variant={running ? "default" : "secondary"} className="capitalize">
          {container.state}
        </Badge>
        {canControl && (
          <div className="flex items-center gap-1">
            {running && (
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                title="Terminal"
                onClick={() =>
                  openDockerExec(container.serverId, container.containerId, container.name)
                }
              >
                <TerminalSquare className="size-3.5" />
              </Button>
            )}
            {!running && (
              <DockerPowerDialog
                serverId={container.serverId}
                containerId={container.containerId}
                containerName={container.name}
                action="start"
                onDone={onDone}
                trigger={
                  <Button variant="ghost" size="icon" className="size-6" title="Starten">
                    <Play className="size-3.5" />
                  </Button>
                }
              />
            )}
            {running && (
              <>
                <DockerPowerDialog
                  serverId={container.serverId}
                  containerId={container.containerId}
                  containerName={container.name}
                  action="restart"
                  onDone={onDone}
                  trigger={
                    <Button variant="ghost" size="icon" className="size-6" title="Neu starten">
                      <RotateCw className="size-3.5" />
                    </Button>
                  }
                />
                <DockerPowerDialog
                  serverId={container.serverId}
                  containerId={container.containerId}
                  containerName={container.name}
                  action="stop"
                  onDone={onDone}
                  trigger={
                    <Button variant="ghost" size="icon" className="size-6" title="Stoppen">
                      <Square className="size-3.5" />
                    </Button>
                  }
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
