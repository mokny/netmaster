"use client";

import { useEffect, useState } from "react";
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
            setConnectionError(msg.message ?? "Fehler beim Abrufen der Prozesse");
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
        toast.error(data.error ?? "Kill fehlgeschlagen");
        return;
      }
      toast.success(`Prozess ${killTarget.pid} beendet`);
      setKillTarget(null);
      setForceKill(false);
    } catch {
      toast.error("Verbindung fehlgeschlagen");
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
          <CardTitle>Prozesse</CardTitle>
          <CardDescription>Live-Prozessliste (CPU-sortiert)</CardDescription>
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
            <p className="text-sm text-muted-foreground">Lade Prozessliste…</p>
          ) : processes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Prozesse gefunden.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PID</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Befehl</TableHead>
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
            <DialogTitle>Prozess beenden?</DialogTitle>
            <DialogDescription>
              {killTarget && (
                <>
                  PID <span className="font-mono">{killTarget.pid}</span> ({killTarget.command}) von{" "}
                  {killTarget.user} wird beendet.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={forceKill}
              onChange={(e) => setForceKill(e.target.checked)}
            />
            Force Kill (SIGKILL statt SIGTERM)
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKillTarget(null)} disabled={killing}>
              Abbrechen
            </Button>
            <Button variant="destructive" onClick={confirmKill} disabled={killing}>
              {forceKill ? "Force Kill" : "Beenden"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
