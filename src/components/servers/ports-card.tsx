"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
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
import { usePollingEnabled } from "@/hooks/use-polling-enabled";

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
  const t = useTranslations("servers.ports");
  const tErrors = useTranslations("errors");
  const [ports, setPorts] = useState<PortEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollingEnabled = usePollingEnabled("portsEnabled");

  useEffect(() => {
    if (!pollingEnabled) return;
    let stopped = false;
    async function load() {
      try {
        const res = await fetch(`/api/servers/${serverId}/ports`);
        const data = await res.json().catch(() => ({}));
        if (stopped) return;
        if (!res.ok) {
          setError(data.error ? tErrors(data.error) : t("fetchFailed"));
          return;
        }
        setPorts(data.ports);
        setError(null);
      } catch {
        if (!stopped) setError(t("connectionFailed"));
      }
    }
    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [serverId, pollingEnabled]);

  const listening = (ports ?? []).filter((p) => p.state === "LISTEN");
  const established = (ports ?? []).filter((p) => p.state !== "LISTEN");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>{t("cardTitle")}</CardTitle>
          <CardDescription>{t("cardDescription")}</CardDescription>
        </div>
        <Network className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {error && <p className="mb-2 text-sm text-red-500">{error}</p>}
        {!ports ? (
          <p className="text-sm text-muted-foreground">{t("loadingPorts")}</p>
        ) : (
          <Tabs defaultValue="listening">
            <TabsList>
              <TabsTrigger value="listening">{t("listening", { count: listening.length })}</TabsTrigger>
              <TabsTrigger value="established">{t("connections", { count: established.length })}</TabsTrigger>
            </TabsList>
            <TabsContent value="listening">
              <div className="max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Port</TableHead>
                      <TableHead>{t("protoColumn")}</TableHead>
                      <TableHead>{t("addressColumn")}</TableHead>
                      <TableHead>{t("programColumn")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listening.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-sm text-muted-foreground">
                          {t("noListeningPorts")}
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
                      <TableHead>{t("localColumn")}</TableHead>
                      <TableHead>{t("remoteColumn")}</TableHead>
                      <TableHead>{t("protoColumn")}</TableHead>
                      <TableHead>{t("programColumn")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {established.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-sm text-muted-foreground">
                          {t("noActiveConnections")}
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
