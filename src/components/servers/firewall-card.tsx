"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useSession } from "@/hooks/use-session";
import { ShieldCheck, Trash2, Loader2 } from "lucide-react";

interface SimpleFirewallRule {
  id: string;
  action: "allow" | "deny";
  protocol: "tcp" | "udp";
  port: number;
  source: string | null;
}

interface FirewallState {
  backend: "nft" | "iptables" | "ufw" | "none";
  raw: string;
  managedRules: SimpleFirewallRule[];
}

export function FirewallCard({ serverId }: { serverId: string }) {
  const session = useSession();
  const confirm = useConfirm();
  const canEdit = session?.role === "EDITOR" || session?.role === "ADMIN";
  const isAdmin = session?.role === "ADMIN";

  const [state, setState] = useState<FirewallState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const [form, setForm] = useState({
    action: "allow" as "allow" | "deny",
    protocol: "tcp" as "tcp" | "udp",
    port: "",
    source: "",
  });
  const [rawScript, setRawScript] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/servers/${serverId}/firewall`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Fehler beim Abrufen der Firewall-Regeln");
        return;
      }
      setState(data);
      setError(null);
    } catch {
      setError("Verbindung fehlgeschlagen");
    }
  }, [serverId]);

  useEffect(() => {
    load();
  }, [load]);

  async function afterApply(rollbackTimeoutMs: number, pendingMsg: string) {
    toast.info(pendingMsg, {
      description: `Automatische Bestätigung läuft (bis ${Math.round(rollbackTimeoutMs / 1000)}s) – bei Verbindungsverlust wird die Änderung automatisch zurückgerollt.`,
    });
    await load();
    setTimeout(() => {
      load();
    }, rollbackTimeoutMs + 2000);
  }

  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    const port = Number(form.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      toast.error("Ungültiger Port");
      return;
    }
    setApplying(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/firewall/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: form.action,
          protocol: form.protocol,
          port,
          source: form.source || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Regel konnte nicht angewendet werden");
        return;
      }
      setForm({ action: "allow", protocol: "tcp", port: "", source: "" });
      await afterApply(data.rollbackTimeoutMs, "Regel wird angewendet…");
    } catch {
      toast.error("Verbindung fehlgeschlagen");
    } finally {
      setApplying(false);
    }
  }

  async function deleteRule(rule: SimpleFirewallRule) {
    if (
      !(await confirm({
        title: "Regel löschen",
        description: `${rule.action === "allow" ? "Allow" : "Deny"} ${rule.protocol}/${rule.port}${rule.source ? ` von ${rule.source}` : ""} wirklich löschen?`,
        confirmText: "Löschen",
        variant: "destructive",
      }))
    )
      return;
    setApplying(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/firewall/rules/${rule.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Löschen fehlgeschlagen");
        return;
      }
      await afterApply(data.rollbackTimeoutMs, "Regel wird gelöscht…");
    } catch {
      toast.error("Verbindung fehlgeschlagen");
    } finally {
      setApplying(false);
    }
  }

  async function applyRaw() {
    if (!rawScript.trim()) return;
    if (
      !(await confirm({
        title: "Rohe Firewall-Befehle ausführen",
        description:
          "Diese Befehle werden ungeprüft mit root-Rechten ausgeführt. Bei Verbindungsverlust wird automatisch auf den vorherigen Zustand zurückgerollt.",
        confirmText: "Ausführen",
        variant: "destructive",
      }))
    )
      return;
    setApplying(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/firewall/raw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: rawScript }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Ausführung fehlgeschlagen");
        return;
      }
      if (data.stderr) toast.warning(data.stderr.slice(0, 300));
      await afterApply(data.rollbackTimeoutMs, "Skript wird angewendet…");
    } catch {
      toast.error("Verbindung fehlgeschlagen");
    } finally {
      setApplying(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Firewall</CardTitle>
          <CardDescription>
            {state?.backend && state.backend !== "none"
              ? `Backend: ${state.backend}`
              : "Regelverwaltung mit automatischem Lockout-Schutz"}
          </CardDescription>
        </div>
        <ShieldCheck className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-red-500">{error}</p>}
        {state?.backend === "none" && (
          <p className="text-sm text-muted-foreground">
            Kein unterstütztes Firewall-Backend (nftables/iptables/ufw) auf diesem Server erkannt.
          </p>
        )}

        <Tabs defaultValue="simple">
          <TabsList>
            <TabsTrigger value="simple">Einfach</TabsTrigger>
            {isAdmin && <TabsTrigger value="advanced">Advanced</TabsTrigger>}
          </TabsList>

          <TabsContent value="simple" className="space-y-4">
            <div className="max-h-56 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Aktion</TableHead>
                    <TableHead>Proto</TableHead>
                    <TableHead>Port</TableHead>
                    <TableHead>Quelle</TableHead>
                    {canEdit && <TableHead className="w-8" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(state?.managedRules ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-sm text-muted-foreground">
                        Keine von NetMaster verwalteten Regeln.
                      </TableCell>
                    </TableRow>
                  ) : (
                    state!.managedRules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell>
                          <Badge variant={rule.action === "allow" ? "default" : "destructive"}>
                            {rule.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="uppercase text-xs">{rule.protocol}</TableCell>
                        <TableCell className="font-mono text-xs">{rule.port}</TableCell>
                        <TableCell className="font-mono text-xs">{rule.source ?? "überall"}</TableCell>
                        {canEdit && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6"
                              disabled={applying}
                              onClick={() => deleteRule(rule)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {canEdit && (
              <form onSubmit={addRule} className="grid grid-cols-2 gap-3 rounded-md border p-3 sm:grid-cols-5">
                <div className="space-y-1">
                  <Label className="text-xs">Aktion</Label>
                  <Select value={form.action} onValueChange={(v) => setForm((f) => ({ ...f, action: v as "allow" | "deny" }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="allow">Allow</SelectItem>
                      <SelectItem value="deny">Deny</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Protokoll</Label>
                  <Select value={form.protocol} onValueChange={(v) => setForm((f) => ({ ...f, protocol: v as "tcp" | "udp" }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tcp">TCP</SelectItem>
                      <SelectItem value="udp">UDP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Port</Label>
                  <Input
                    type="number"
                    min={1}
                    max={65535}
                    required
                    value={form.port}
                    onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Quelle (optional)</Label>
                  <Input
                    placeholder="0.0.0.0/0"
                    value={form.source}
                    onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={applying} className="w-full">
                    {applying && <Loader2 className="size-4 animate-spin" />}
                    Anwenden
                  </Button>
                </div>
              </form>
            )}
          </TabsContent>

          {isAdmin && (
            <TabsContent value="advanced" className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Rohe {state?.backend ?? "nft/iptables/ufw"}-Befehle, mit demselben
                Auto-Rollback-Schutz wie im einfachen Modus.
              </p>
              <textarea
                className="min-h-32 w-full rounded-md border bg-transparent p-2 font-mono text-xs shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={rawScript}
                onChange={(e) => setRawScript(e.target.value)}
                placeholder={
                  state?.backend === "ufw"
                    ? "ufw allow 8080/tcp"
                    : state?.backend === "iptables"
                      ? "iptables -A INPUT -p tcp --dport 8080 -j ACCEPT"
                      : "nft add rule inet filter input tcp dport 8080 accept"
                }
              />
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Aktuellen Regelsatz anzeigen</summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted p-2">{state?.raw || "–"}</pre>
              </details>
              <Button onClick={applyRaw} disabled={applying || !rawScript.trim()}>
                {applying && <Loader2 className="size-4 animate-spin" />}
                Ausführen
              </Button>
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}
