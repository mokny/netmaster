"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronUp, Cpu, X } from "lucide-react";

interface ProcessRow {
  pid: number;
  user: string;
  cpuPercent: number;
  memPercent: number;
  command: string;
}

export function ProcessManagerCard({
  serverId,
  canKill,
}: {
  serverId: string;
  canKill: boolean;
}) {
  const t = useTranslations("servers.processManager");
  const tErrors = useTranslations("errors");
  const [expanded, setExpanded] = useState(false);
  const [processes, setProcesses] = useState<ProcessRow[] | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [killTarget, setKillTarget] = useState<ProcessRow | null>(null);
  const [forceKill, setForceKill] = useState(false);
  const [killing, setKilling] = useState(false);

  useEffect(() => {
    if (!expanded) return;

    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let ws: WebSocket | null = null;

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(
        `${protocol}://${window.location.host}/api/ws/processes?serverId=${encodeURIComponent(serverId)}`
      );
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "processes") {
            setProcesses(msg.processes);
            setConnectionError(null);
          }
          if (msg.type === "error") {
            setConnectionError(msg.message ?? t("fetchFailed"));
          }
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        if (!stopped) reconnectTimer = setTimeout(connect, 3000);
      };
    }
    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [serverId, expanded]);

  async function confirmKill() {
    if (!killTarget) return;
    setKilling(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/processes/kill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pid: killTarget.pid, signal: forceKill ? "KILL" : "TERM" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ? tErrors(data.error) : t("killFailed"));
        return;
      }
      toast.success(t("processTerminated", { pid: killTarget.pid }));
      setKillTarget(null);
      setForceKill(false);
    } catch {
      toast.error(t("connectionFailed"));
    } finally {
      setKilling(false);
    }
  }

  return (
    <Card>
      <CardHeader
        className="flex flex-row items-center justify-between space-y-0 cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}
      >
        <div>
          <CardTitle>{t("cardTitle")}</CardTitle>
          <CardDescription>{t("cardDescription")}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Cpu className="size-4 text-muted-foreground" />
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
          >
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          {connectionError && (
            <p className="mb-2 text-sm text-red-500">{connectionError}</p>
          )}
          {!processes ? (
            <p className="text-sm text-muted-foreground">{t("loadingProcesses")}</p>
          ) : processes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noProcessesFound")}</p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PID</TableHead>
                    <TableHead>{t("userColumn")}</TableHead>
                    <TableHead>{t("commandColumn")}</TableHead>
                    <TableHead className="text-right">CPU%</TableHead>
                    <TableHead className="text-right">RAM%</TableHead>
                    {canKill && <TableHead className="w-8" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processes.slice(0, 100).map((p) => (
                    <TableRow key={p.pid}>
                      <TableCell className="font-mono text-xs">{p.pid}</TableCell>
                      <TableCell className="max-w-24 truncate text-xs">{p.user}</TableCell>
                      <TableCell className="max-w-48 truncate text-xs">{p.command}</TableCell>
                      <TableCell className="text-right text-xs">{p.cpuPercent.toFixed(1)}</TableCell>
                      <TableCell className="text-right text-xs">{p.memPercent.toFixed(1)}</TableCell>
                      {canKill && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6"
                            onClick={() => {
                              setForceKill(false);
                              setKillTarget(p);
                            }}
                          >
                            <X className="size-3.5" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      )}

      <Dialog open={killTarget != null} onOpenChange={(o) => !o && setKillTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("terminateProcessTitle")}</DialogTitle>
            <DialogDescription>
              {killTarget && (
                t("terminateProcessDescription", {
                  pid: killTarget.pid,
                  command: killTarget.command,
                  user: killTarget.user,
                })
              )}
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={forceKill}
              onChange={(e) => setForceKill(e.target.checked)}
            />
            {t("forceKillLabel")}
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKillTarget(null)} disabled={killing}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmKill} disabled={killing}>
              {forceKill ? t("forceKill") : t("terminate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
