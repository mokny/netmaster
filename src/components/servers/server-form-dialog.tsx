"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus } from "lucide-react";
import type { ServerDTO } from "@/lib/types";

interface Props {
  server?: ServerDTO;
  onSaved: () => void;
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function formFromServer(server?: ServerDTO) {
  return {
    name: server?.name ?? "",
    hostname: server?.hostname ?? "",
    sshPort: server?.sshPort ?? 22,
    sshUsername: server?.sshUsername ?? "root",
    authType: server?.authType ?? "PASSWORD",
    secret: "",
    passphrase: "",
    sudoPassword: "",
    pollIntervalSec: server?.pollIntervalSec ?? 30,
    retentionDays: server?.retentionDays ?? 30,
    dockerEnabled: server?.dockerEnabled ?? false,
    proxmoxEnabled: server?.proxmoxEnabled ?? false,
    cpuWarn: server?.cpuWarn ?? 70,
    cpuCrit: server?.cpuCrit ?? 90,
    memWarn: server?.memWarn ?? 75,
    memCrit: server?.memCrit ?? 90,
    diskWarn: server?.diskWarn ?? 80,
    diskCrit: server?.diskCrit ?? 95,
    description: server?.description ?? "",
    tags: server?.tags ?? "",
  };
}

export function ServerFormDialog({
  server,
  onSaved,
  trigger,
  open: openProp,
  onOpenChange,
}: Props) {
  const isEdit = Boolean(server);
  const controlled = openProp !== undefined;
  const [openState, setOpenState] = useState(false);
  const open = controlled ? openProp : openState;
  const setOpen = onOpenChange ?? setOpenState;
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState(() => formFromServer(server));

  // Formular auf die aktuellen Server-Werte zurücksetzen, sobald der Dialog
  // (wieder) geöffnet wird — der Dialog bleibt sonst dauerhaft gemountet.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm(formFromServer(server));
    }
  }

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(isEdit ? `/api/servers/${server!.id}` : "/api/servers", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Speichern fehlgeschlagen");
        return;
      }
      toast.success(isEdit ? "Server aktualisiert" : "Server hinzugefügt");
      setOpen(false);
      onSaved();
    } catch {
      toast.error("Verbindung zum Server fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {(!controlled || trigger) && (
        <DialogTrigger
          render={
            trigger ?? (
              <Button size="sm">
                <Plus className="size-4" />
                Server hinzufügen
              </Button>
            )
          }
        />
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Server bearbeiten" : "Server hinzufügen"}</DialogTitle>
          <DialogDescription>
            Zugangsdaten werden AES-256-verschlüsselt gespeichert.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Tabs defaultValue="general">
            <TabsList className="w-full">
              <TabsTrigger value="general">Allgemein</TabsTrigger>
              <TabsTrigger value="ssh">SSH-Zugang</TabsTrigger>
              <TabsTrigger value="thresholds">Schwellwerte</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-3">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  required
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Produktiv-Server 1"
                />
              </div>
              <div className="space-y-2">
                <Label>Beschreibung</Label>
                <Input
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="z.B. Haupt-Webserver"
                />
              </div>
              <div className="space-y-2">
                <Label>Tags (kommagetrennt)</Label>
                <Input
                  value={form.tags}
                  onChange={(e) => set("tags", e.target.value)}
                  placeholder="prod, web"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Poll-Intervall (Sek.)</Label>
                  <Input
                    type="number"
                    min={5}
                    value={form.pollIntervalSec}
                    onChange={(e) => set("pollIntervalSec", Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Retention (Tage)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.retentionDays}
                    onChange={(e) => set("retentionDays", Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="docker-enabled">Docker aktivieren</Label>
                    <p className="text-xs text-muted-foreground">
                      Container/Images erkennen und verwalten
                    </p>
                  </div>
                  <Switch
                    id="docker-enabled"
                    checked={form.dockerEnabled}
                    onCheckedChange={(c) => set("dockerEnabled", !!c)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="proxmox-enabled">Proxmox aktivieren</Label>
                    <p className="text-xs text-muted-foreground">
                      VMs/LXC-Container erkennen und verwalten
                    </p>
                  </div>
                  <Switch
                    id="proxmox-enabled"
                    checked={form.proxmoxEnabled}
                    onCheckedChange={(c) => set("proxmoxEnabled", !!c)}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="ssh" className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-2">
                  <Label>Hostname / IP</Label>
                  <Input
                    required
                    value={form.hostname}
                    onChange={(e) => set("hostname", e.target.value)}
                    placeholder="192.168.1.10"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Port</Label>
                  <Input
                    type="number"
                    value={form.sshPort}
                    onChange={(e) => set("sshPort", Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>SSH-Benutzername</Label>
                <Input
                  required
                  value={form.sshUsername}
                  onChange={(e) => set("sshUsername", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Authentifizierung</Label>
                <Select
                  value={form.authType}
                  onValueChange={(v) => set("authType", v as "PASSWORD" | "PRIVATE_KEY")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PASSWORD">Passwort</SelectItem>
                    <SelectItem value="PRIVATE_KEY">Privater Schlüssel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>
                  {form.authType === "PASSWORD" ? "Passwort" : "Privater Schlüssel (PEM)"}
                  {isEdit && (
                    <span className="ml-1 font-normal text-muted-foreground">
                      (leer lassen, um beizubehalten)
                    </span>
                  )}
                </Label>
                {form.authType === "PASSWORD" ? (
                  <Input
                    type="password"
                    value={form.secret}
                    onChange={(e) => set("secret", e.target.value)}
                    required={!isEdit}
                  />
                ) : (
                  <textarea
                    className="min-h-32 w-full rounded-md border bg-transparent p-2 font-mono text-xs shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={form.secret}
                    onChange={(e) => set("secret", e.target.value)}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    required={!isEdit}
                  />
                )}
              </div>
              {form.authType === "PRIVATE_KEY" && (
                <div className="space-y-2">
                  <Label>
                    Passphrase
                    <span className="ml-1 font-normal text-muted-foreground">
                      (optional, falls Schlüssel geschützt ist
                      {isEdit ? " — leer lassen, um beizubehalten" : ""})
                    </span>
                  </Label>
                  <Input
                    type="password"
                    value={form.passphrase}
                    onChange={(e) => set("passphrase", e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>
                  Sudo-Passwort
                  <span className="ml-1 font-normal text-muted-foreground">
                    (optional, für reboot/shutdown als Nicht-root-User
                    {isEdit ? " — leer lassen, um beizubehalten" : ""})
                  </span>
                </Label>
                <Input
                  type="password"
                  value={form.sudoPassword}
                  onChange={(e) => set("sudoPassword", e.target.value)}
                />
              </div>
            </TabsContent>

            <TabsContent value="thresholds" className="space-y-3">
              {(
                [
                  ["cpuWarn", "cpuCrit", "CPU (%)"],
                  ["memWarn", "memCrit", "RAM (%)"],
                  ["diskWarn", "diskCrit", "Disk (%)"],
                ] as const
              ).map(([warnKey, critKey, label]) => (
                <div key={label} className="grid grid-cols-3 items-end gap-3">
                  <Label className="col-span-3 sm:col-span-1">{label}</Label>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Warnung</Label>
                    <Input
                      type="number"
                      value={form[warnKey]}
                      onChange={(e) => set(warnKey, Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Kritisch</Label>
                    <Input
                      type="number"
                      value={form[critKey]}
                      onChange={(e) => set(critKey, Number(e.target.value))}
                    />
                  </div>
                </div>
              ))}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
