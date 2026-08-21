"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/status-badge";
import { StatusDetailDialog } from "@/components/status-detail-dialog";
import { ServerFormDialog } from "@/components/servers/server-form-dialog";
import { PowerActionDialog } from "@/components/servers/power-action-dialog";
import { MoreVertical, Pencil, Trash2, RotateCw, Power } from "lucide-react";
import type { ServerDTO } from "@/lib/types";

export function ServerCard({
  server,
  canEdit,
  canDelete,
  onSaved,
  onDelete,
}: {
  server: ServerDTO;
  canEdit: boolean;
  canDelete: boolean;
  onSaved: () => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations("servers.card");
  const [editOpen, setEditOpen] = useState(false);
  const [rebootOpen, setRebootOpen] = useState(false);
  const [shutdownOpen, setShutdownOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  async function recheck() {
    const res = await fetch(`/api/servers/${server.id}/check`, { method: "POST" });
    if (!res.ok) throw new Error(t("checkFailed"));
    onSaved();
  }

  return (
    <Card className="relative">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">
            <Link href={`/servers/${server.id}`} className="hover:underline">
              {server.name}
            </Link>
          </CardTitle>
          <CardDescription>{server.hostname}</CardDescription>
        </div>
        {(canEdit || canDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" className="size-7">
                  <MoreVertical className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              {canEdit && (
                <DropdownMenuItem onClick={() => setRebootOpen(true)}>
                  <RotateCw className="size-4" />
                  {t("restart")}
                </DropdownMenuItem>
              )}
              {canEdit && (
                <DropdownMenuItem onClick={() => setShutdownOpen(true)}>
                  <Power className="size-4" />
                  {t("shutdown")}
                </DropdownMenuItem>
              )}
              {canEdit && (
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Pencil className="size-4" />
                  {t("edit")}
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => onDelete(server.id)}
                >
                  <Trash2 className="size-4" />
                  {t("delete")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        <StatusBadge status={server.lastStatus} onClick={() => setDetailOpen(true)} />
        {server.description && (
          <p className="text-sm text-muted-foreground">{server.description}</p>
        )}
        {server.lastError && (
          <p className="truncate text-xs text-red-500" title={server.lastError}>
            {server.lastError}
          </p>
        )}
        <div className="flex flex-wrap gap-1 pt-1">
          {server.tags
            .split(",")
            .map((tagValue) => tagValue.trim())
            .filter(Boolean)
            .map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
        </div>
      </CardContent>

      {canEdit && (
        <ServerFormDialog
          server={server}
          onSaved={onSaved}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
      {canEdit && (
        <PowerActionDialog
          serverId={server.id}
          serverName={server.name}
          action="reboot"
          open={rebootOpen}
          onOpenChange={setRebootOpen}
        />
      )}
      {canEdit && (
        <PowerActionDialog
          serverId={server.id}
          serverName={server.name}
          action="shutdown"
          open={shutdownOpen}
          onOpenChange={setShutdownOpen}
        />
      )}
      <StatusDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        title={server.name}
        subtitle={server.hostname}
        status={server.lastStatus}
        error={server.lastError}
        checkedAt={server.lastCheckedAt}
        metrics={[
          { label: "CPU", status: server.lastCpuStatus },
          { label: t("memory"), status: server.lastMemStatus },
          { label: t("diskSpace"), status: server.lastDiskStatus },
          { label: t("network"), status: server.lastNetStatus },
        ]}
        onRecheck={recheck}
      />
    </Card>
  );
}
