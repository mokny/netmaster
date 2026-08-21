"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

interface Props {
  onSaved: () => void;
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  // Vorausgefüllte Werte für ein neu anzulegendes Gerät (z.B. aus der
  // Explore-Netzwerkerkennung).
  initial?: { name?: string; hostname?: string };
}

export function RouterDeviceDialog({
  onSaved,
  trigger,
  open: openProp,
  onOpenChange,
  initial,
}: Props) {
  const t = useTranslations("router.deviceDialog");
  const tErrors = useTranslations("errors");
  const tc = useTranslations("common");
  const controlled = openProp !== undefined;
  const [openState, setOpenState] = useState(false);
  const open = controlled ? openProp : openState;
  const setOpen = onOpenChange ?? setOpenState;
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    type: "FRITZBOX" as "FRITZBOX" | "REPEATER",
    hostname: initial?.hostname ?? "fritz.box",
    port: 49000,
    useTls: false,
    username: "",
    password: "",
    pollIntervalSec: 60,
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/router-devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ? tErrors(data.error) : t("saveFailed"));
        return;
      }
      toast.success(t("deviceAdded"));
      setOpen(false);
      onSaved();
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
                {t("addDevice")}
              </Button>
            )
          }
        />
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addRouterDevice")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{tc("name")}</Label>
              <Input
                required
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={t("namePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("type")}</Label>
              <Select value={form.type} onValueChange={(v) => set("type", v as typeof form.type)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FRITZBOX">FritzBox</SelectItem>
                  <SelectItem value="REPEATER">FritzRepeater</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t("hostIp")}</Label>
              <Input
                required
                value={form.hostname}
                onChange={(e) => set("hostname", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("tr064Port")}</Label>
              <Input
                type="number"
                value={form.port}
                onChange={(e) => set("port", Number(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("username")}</Label>
            <Input
              required
              value={form.username}
              onChange={(e) => set("username", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("password")}</Label>
            <Input
              required
              type="password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label className="font-normal">{t("useTls")}</Label>
            <Switch checked={form.useTls} onCheckedChange={(c) => set("useTls", !!c)} />
          </div>
          <div className="space-y-2">
            <Label>{t("pollInterval")}</Label>
            <Input
              type="number"
              value={form.pollIntervalSec}
              onChange={(e) => set("pollIntervalSec", Number(e.target.value))}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              {tc("add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
