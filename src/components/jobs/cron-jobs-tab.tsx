"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { CronEntryDialog } from "@/components/jobs/cron-entry-dialog";
import type { CronEntry } from "@/lib/cron-types";

interface ServerOption {
  id: string;
  name: string;
  sshUsername: string;
}

export function CronJobsTab() {
  const t = useTranslations("jobs.cron");
  const tErrors = useTranslations("errors");
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [serverId, setServerId] = useState<string>("");
  const [user, setUser] = useState("");
  const [entries, setEntries] = useState<CronEntry[] | null>(null);
  const confirm = useConfirm();

  useEffect(() => {
    fetch("/api/servers")
      .then((res) => (res.ok ? res.json() : { servers: [] }))
      .then((data: { servers: ServerOption[] }) => {
        setServers(data.servers ?? []);
        if (data.servers?.length && !serverId) {
          setServerId(data.servers[0].id);
          setUser(data.servers[0].sshUsername);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!serverId || !user) return;
    setEntries(null);
    const res = await fetch(`/api/cron/${serverId}?user=${encodeURIComponent(user)}`);
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ? tErrors(data.error) : t("loadFailed"));
      setEntries([]);
      return;
    }
    setEntries(data.entries ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, user]);

  useEffect(() => {
    load();
  }, [load]);

  function selectServer(id: string | null) {
    if (!id) return;
    setServerId(id);
    const server = servers.find((s) => s.id === id);
    setUser(server?.sshUsername ?? "");
  }

  async function deleteEntry(entry: CronEntry) {
    const ok = await confirm({ title: t("deleteConfirm"), variant: "destructive" });
    if (!ok) return;
    const res = await fetch(`/api/cron/${serverId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, target: { id: entry.id, raw: entry.raw } }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ? tErrors(data.error) : t("deleteFailed"));
      return;
    }
    toast.success(t("entryDeleted"));
    setEntries(data.entries ?? []);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("selectServer")}</CardTitle>
        <div className="flex flex-wrap items-end gap-3 pt-2">
          <div className="space-y-1">
            <Label className="text-xs">{t("server")}</Label>
            <Select value={serverId} onValueChange={selectServer}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder={t("selectServer")} />
              </SelectTrigger>
              <SelectContent>
                {servers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("user")}</Label>
            <Input value={user} onChange={(e) => setUser(e.target.value)} className="w-32" />
          </div>
          {serverId && user && (
            <CronEntryDialog serverId={serverId} user={user} onSaved={load} />
          )}
        </div>
        <p className="pt-1 text-xs text-muted-foreground">{t("userHint")}</p>
      </CardHeader>
      <CardContent>
        {entries === null ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noEntries")}</p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry, i) => (
              <div
                key={entry.id ?? `foreign-${i}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{entry.schedule}</span>
                    <Badge variant={entry.managed ? "default" : "outline"} className="text-[10px]">
                      {entry.managed ? t("managedByNetMaster") : t("unmanaged")}
                    </Badge>
                  </div>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {entry.command}
                  </p>
                  {entry.comment && (
                    <p className="truncate text-xs text-muted-foreground">{entry.comment}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <CronEntryDialog serverId={serverId} user={user} entry={entry} onSaved={load} />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => deleteEntry(entry)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
