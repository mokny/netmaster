"use client";

import { HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DiskInfoDTO } from "@/lib/types";

export function DiskSelect({
  disks,
  selected,
  onChange,
}: {
  disks: DiskInfoDTO[];
  selected: string[];
  onChange: (mountpoints: string[]) => void;
}) {
  function toggle(mountpoint: string) {
    onChange(
      selected.includes(mountpoint)
        ? selected.filter((m) => m !== mountpoint)
        : [...selected, mountpoint]
    );
  }

  if (disks.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm">
            <HardDrive className="size-4" />
            Disks
            {selected.length > 0 && (
              <span className="ml-1 rounded-full bg-muted px-1.5 text-xs">
                {selected.length}
              </span>
            )}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Laufwerke anzeigen</DropdownMenuLabel>
          {disks.map((disk) => (
            <DropdownMenuCheckboxItem
              key={disk.mountpoint}
              checked={selected.includes(disk.mountpoint)}
              onCheckedChange={() => toggle(disk.mountpoint)}
              closeOnClick={false}
            >
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span className="truncate">{disk.mountpoint}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {disk.percent != null ? `${disk.percent.toFixed(0)}%` : "–"}
                </span>
              </div>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
