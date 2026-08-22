"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
  // Vorausgefüllter Hostname für ein neu anzulegendes Gerät (z.B. aus der
  // Explore-Netzwerkerkennung) - wird ignoriert, wenn `server` gesetzt ist.
  initialHostname?: string;
}

function formFromServer(server?: ServerDTO, initialHostname?: string) {
  return {
    name: server?.name ?? "",
    hostname: server?.hostname ?? initialHostname ?? "",
    sshPort: server?.sshPort ?? 22,
    sshUsername: server?.sshUsername ?? "root",
    authType: server?.authType ?? "PASSWORD",
    secret: "",
    passphrase: "",
    sudoPassword: "",
    pollIntervalSec: server?.pollIntervalSec ?? 30,
    vmDockerPollIntervalSec: server?.vmDockerPollIntervalSec ?? 7200,
    retentionDays: server?.retentionDays ?? 30,
    dockerEnabled: server?.dockerEnabled ?? false,
    proxmoxEnabled: server?.proxmoxEnabled ?? false,
    networkToolsEnabled: server?.networkToolsEnabled ?? false,
    wireguardEnabled: server?.wireguardEnabled ?? false,
    cpuWarn: server?.cpuWarn ?? 70,
    cpuCrit: server?.cpuCrit ?? 90,
    memWarn: server?.memWarn ?? 75,
    memCrit: server?.memCrit ?? 90,
    diskWarn: server?.diskWarn ?? 80,
    diskCrit: server?.diskCrit ?? 95,
    netUploadWarn: server?.netUploadWarn ?? 800,
    netUploadCrit: server?.netUploadCrit ?? 950,
    netDownloadWarn: server?.netDownloadWarn ?? 800,
    netDownloadCrit: server?.netDownloadCrit ?? 950,
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
  initialHostname,
}: Props) {
  const t = useTranslations("servers.formDialog");
  const tErrors = useTranslations("errors");
  const isEdit = Boolean(server);
  const controlled = openProp !== undefined;
  const [openState, setOpenState] = useState(false);
  const open = controlled ? openProp : openState;
  const setOpen = onOpenChange ?? setOpenState;
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState(() => formFromServer(server, initialHostname));

  // Formular auf die aktuellen Server-Werte zurücksetzen, sobald der Dialog
  // (wieder) geöffnet wird — der Dialog bleibt sonst dauerhaft gemountet.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm(formFromServer(server, initialHostname));
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
        toast.error(data.error ? tErrors(data.error) : t("saveFailed"));
        return;
      }
      toast.success(isEdit ? t("serverUpdated") : t("serverAdded"));
      setOpen(false);
      onSaved();
    } catch {
      toast.error(t("connectionFailed"));
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
                {t("addServer")}
              </Button>
            )
          }
        />
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editServer") : t("addServer")}</DialogTitle>
          <DialogDescription>
            {t("credentialsEncrypted")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Tabs defaultValue="general">
            <TabsList className="w-full">
              <TabsTrigger value="general">{t("tabGeneral")}</TabsTrigger>
              <TabsTrigger value="ssh">{t("tabSsh")}</TabsTrigger>
              <TabsTrigger value="thresholds">{t("tabThresholds")}</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-3">
              <div className="space-y-2">
                <Label>{t("name")}</Label>
                <Input
                  required
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder={t("namePlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("description")}</Label>
                <Input
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder={t("descriptionPlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("tagsLabel")}</Label>
                <Input
                  value={form.tags}
                  onChange={(e) => set("tags", e.target.value)}
                  placeholder="prod, web"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t("pollInterval")}</Label>
                  <Input
                    type="number"
                    min={5}
                    value={form.pollIntervalSec}
                    onChange={(e) => set("pollIntervalSec", Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("retention")}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.retentionDays}
                    onChange={(e) => set("retentionDays", Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("vmDockerPollInterval")}</Label>
                <p className="text-xs text-muted-foreground">{t("vmDockerPollIntervalHint")}</p>
                <Input
                  type="number"
                  min={5}
                  value={Math.round(form.vmDockerPollIntervalSec / 60)}
                  onChange={(e) => set("vmDockerPollIntervalSec", Math.max(5, Number(e.target.value)) * 60)}
                />
              </div>
              <div className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="docker-enabled">{t("enableDocker")}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t("enableDockerHint")}
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
                    <Label htmlFor="proxmox-enabled">{t("enableProxmox")}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t("enableProxmoxHint")}
                    </p>
                  </div>
                  <Switch
                    id="proxmox-enabled"
                    checked={form.proxmoxEnabled}
                    onCheckedChange={(c) => set("proxmoxEnabled", !!c)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="network-tools-enabled">{t("enableNetworkTools")}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t("enableNetworkToolsHint")}
                    </p>
                  </div>
                  <Switch
                    id="network-tools-enabled"
                    checked={form.networkToolsEnabled}
                    onCheckedChange={(c) => set("networkToolsEnabled", !!c)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="wireguard-enabled">{t("enableWireguard")}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t("enableWireguardHint")}
                    </p>
                  </div>
                  <Switch
                    id="wireguard-enabled"
                    checked={form.wireguardEnabled}
                    onCheckedChange={(c) => set("wireguardEnabled", !!c)}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="ssh" className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-2">
                  <Label>{t("hostnameIp")}</Label>
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
                <Label>{t("sshUsername")}</Label>
                <Input
                  required
                  value={form.sshUsername}
                  onChange={(e) => set("sshUsername", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("authentication")}</Label>
                <Select
                  value={form.authType}
                  onValueChange={(v) => set("authType", v as "PASSWORD" | "PRIVATE_KEY")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PASSWORD">{t("password")}</SelectItem>
                    <SelectItem value="PRIVATE_KEY">{t("privateKey")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>
                  {form.authType === "PASSWORD" ? t("password") : t("privateKeyPem")}
                  {isEdit && (
                    <span className="ml-1 font-normal text-muted-foreground">
                      {t("leaveEmptyToKeep")}
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
                      {t("passphraseHint")}
                      {isEdit ? t("keepOnEmptySuffix") : ""})
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
                  {t("sudoPassword")}
                  <span className="ml-1 font-normal text-muted-foreground">
                    {t("sudoPasswordHint")}
                    {isEdit ? t("keepOnEmptySuffix") : ""})
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
                  ["netUploadWarn", "netUploadCrit", "Upload (Mbit/s)"],
                  ["netDownloadWarn", "netDownloadCrit", "Download (Mbit/s)"],
                ] as const
              ).map(([warnKey, critKey, label]) => (
                <div key={label} className="grid grid-cols-3 items-end gap-3">
                  <Label className="col-span-3 sm:col-span-1">{label}</Label>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("warning")}</Label>
                    <Input
                      type="number"
                      value={form[warnKey]}
                      onChange={(e) => set(warnKey, Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("critical")}</Label>
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
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
