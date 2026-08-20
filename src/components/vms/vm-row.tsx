"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VmPowerDialog } from "@/components/vms/vm-power-dialog";
import { VmTerminalMenu } from "@/components/vms/vm-terminal-menu";
import { Play, Square, RotateCw } from "lucide-react";
import type { ProxmoxVmDTO, ProxmoxVmWithServerDTO } from "@/lib/types";

const RUNNING_STATES = new Set(["running"]);

export function VmRow({
  vm,
  canControl,
  href,
  onDone,
}: {
  vm: ProxmoxVmDTO | ProxmoxVmWithServerDTO;
  canControl: boolean;
  href?: string;
  onDone?: () => void;
}) {
  const running = RUNNING_STATES.has(vm.status);
  const serverName = "serverName" in vm ? vm.serverName : null;
  const name = (
    <div className="min-w-0">
      <p className="truncate font-medium">{vm.name}</p>
      <p className="truncate text-xs text-muted-foreground">
        #{vm.vmid}
        {serverName ? ` · ${serverName}` : ""}
        {vm.memUsedMb != null && vm.memTotalMb
          ? ` · ${(vm.memUsedMb / 1024).toFixed(1)} / ${(vm.memTotalMb / 1024).toFixed(1)} GB RAM`
          : ""}
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
        {vm.cpuPercent != null && <span>{vm.cpuPercent.toFixed(1)}% CPU</span>}
        <Badge variant={running ? "default" : "secondary"} className="capitalize">
          {vm.status}
        </Badge>
        {canControl && (
          <div className="flex items-center gap-1">
            {running && (
              <VmTerminalMenu
                serverId={vm.serverId}
                vmid={vm.vmid}
                vmName={vm.name}
                vmType={vm.type}
              />
            )}
            {!running && (
              <VmPowerDialog
                serverId={vm.serverId}
                vmid={vm.vmid}
                vmName={vm.name}
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
                <VmPowerDialog
                  serverId={vm.serverId}
                  vmid={vm.vmid}
                  vmName={vm.name}
                  action="reboot"
                  onDone={onDone}
                  trigger={
                    <Button variant="ghost" size="icon" className="size-6" title="Neu starten">
                      <RotateCw className="size-3.5" />
                    </Button>
                  }
                />
                <VmPowerDialog
                  serverId={vm.serverId}
                  vmid={vm.vmid}
                  vmName={vm.name}
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
