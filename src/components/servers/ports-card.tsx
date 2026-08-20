"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Network } from "lucide-react";

interface PortEntry {
  protocol: "tcp" | "udp";
  state: string;
  localAddress: string;
  localPort: number;
  peerAddress: string | null;
  peerPort: number | null;
  program: string | null;
  pid: number | null;
}

const POLL_MS = 15_000;

export function PortsCard({ serverId }: { serverId: string }) {
  const [ports, setPorts] = useState<PortEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const res = await fetch(`/api/servers/${serverId}/ports`);
        const data = await res.json().catch(() => ({}));
        if (stopped) return;
        if (!res.ok) {
          setError(data.error ?? "Fehler beim Abrufen der Ports");
          return;
        }
        setPorts(data.ports);
        setError(null);
      } catch {
        if (!stopped) setError("Verbindung fehlgeschlagen");
      }
    }
    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [serverId]);

  const listening = (ports ?? []).filter((p) => p.state === "LISTEN");
  const established = (ports ?? []).filter((p) => p.state !== "LISTEN");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Offene Ports</CardTitle>
          <CardDescription>Lauschende Ports und aktive Verbindungen (live)</CardDescription>
        </div>
        <Network className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {error && <p className="mb-2 text-sm text-red-500">{error}</p>}
        {!ports ? (
          <p className="text-sm text-muted-foreground">Lade Ports…</p>
        ) : (
          <Tabs defaultValue="listening">
            <TabsList>
              <TabsTrigger value="listening">Listening ({listening.length})</TabsTrigger>
              <TabsTrigger value="established">Verbindungen ({established.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="listening">
              <div className="max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Port</TableHead>
                      <TableHead>Proto</TableHead>
                      <TableHead>Adresse</TableHead>
                      <TableHead>Programm</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listening.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-sm text-muted-foreground">
                          Keine lauschenden Ports gefunden.
                        </TableCell>
                      </TableRow>
                    ) : (
                      listening.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{p.localPort}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="uppercase">
                              {p.protocol}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{p.localAddress}</TableCell>
                          <TableCell className="text-xs">
                            {p.program ? `${p.program}${p.pid ? ` (${p.pid})` : ""}` : "–"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
            <TabsContent value="established">
              <div className="max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lokal</TableHead>
                      <TableHead>Remote</TableHead>
                      <TableHead>Proto</TableHead>
                      <TableHead>Programm</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {established.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-sm text-muted-foreground">
                          Keine aktiven Verbindungen.
                        </TableCell>
                      </TableRow>
                    ) : (
                      established.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">
                            {p.localAddress}:{p.localPort}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {p.peerAddress ? `${p.peerAddress}:${p.peerPort ?? "?"}` : "–"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="uppercase">
                              {p.protocol}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {p.program ? `${p.program}${p.pid ? ` (${p.pid})` : ""}` : "–"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
