"use client";

import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTerminalManager } from "@/hooks/use-terminal-manager";
import { TerminalSquare, MonitorSmartphone } from "lucide-react";
import type { VariantProps } from "class-variance-authority";

type ButtonSize = VariantProps<typeof buttonVariants>["size"];

// LXC hat nur eine Konsolen-Option ('pct enter'). QEMU bietet zusätzlich
// eine VNC-Konsole an, da 'qm terminal' eine im Gast-OS eingerichtete
// serielle Konsole voraussetzt und daher nicht bei jeder VM funktioniert.
export function VmTerminalMenu({
  serverId,
  vmid,
  vmName,
  vmType,
  size = "icon",
}: {
  serverId: string;
  vmid: number;
  vmName: string;
  vmType: "QEMU" | "LXC";
  size?: ButtonSize;
}) {
  const t = useTranslations("vms.terminalMenu");
  const { openVmTerminal, openVmVnc } = useTerminalManager();

  if (vmType === "LXC") {
    return (
      <Button
        variant="ghost"
        size={size}
        className={size === "icon" ? "size-6" : undefined}
        title={t("terminal")}
        onClick={() => openVmTerminal(serverId, vmid, vmName, vmType)}
      >
        <TerminalSquare className="size-3.5" />
        {size !== "icon" && t("terminal")}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size={size}
            className={size === "icon" ? "size-6" : undefined}
            title={t("terminal")}
          >
            <TerminalSquare className="size-3.5" />
            {size !== "icon" && t("terminal")}
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => openVmVnc(serverId, vmid, vmName)}>
          <MonitorSmartphone className="size-4" />
          {t("vncConsole")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openVmTerminal(serverId, vmid, vmName, vmType)}>
          <TerminalSquare className="size-4" />
          {t("serialConsole")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
