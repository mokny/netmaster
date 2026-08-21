"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Bell, Loader2 } from "lucide-react";
import type { ServiceCheckDTO, ServiceCheckSubscriberDTO } from "@/lib/types";

const DEFAULT_PREF: ServiceCheckSubscriberDTO = {
  downEnabled: false,
  downDelayMin: 0,
  downRecoveryEnabled: false,
  slowEnabled: false,
  slowDelayMin: 0,
  slowRecoveryEnabled: false,
};

export function CheckNotifyDialog({ check }: { check: ServiceCheckDTO }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pref, setPref] = useState<ServiceCheckSubscriberDTO>(DEFAULT_PREF);
  const [latencyWarnMs, setLatencyWarnMs] = useState<string>(
    check.latencyWarnMs != null ? String(check.latencyWarnMs) : ""
  );

  useEffect(() => {
    if (!open) return;
    fetch(`/api/checks/${check.id}/notify`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setPref(data.pref))
      .catch(() => {});
  }, [open, check.id]);

  async function save() {
    setLoading(true);
    try {
      const res = await fetch(`/api/checks/${check.id}/notify`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...pref,
          latencyWarnMs: latencyWarnMs === "" ? null : Number(latencyWarnMs),
        }),
      });
      if (!res.ok) {
        toast.error("Speichern fehlgeschlagen");
        return;
      }
      toast.success("Benachrichtigungen gespeichert");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" className="size-6">
            <Bell className="size-3.5" />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Benachrichtigungen: {check.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">Ausfall (Down)</p>
            <div className="flex items-center justify-between">
              <Label className="font-normal">Aktiv</Label>
              <Switch
                checked={pref.downEnabled}
                onCheckedChange={(c) => setPref((p) => ({ ...p, downEnabled: !!c }))}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label className="font-normal">Verzögerung (Min)</Label>
              <Input
                type="number"
                min={0}
                className="w-24"
                value={pref.downDelayMin}
                onChange={(e) =>
                  setPref((p) => ({ ...p, downDelayMin: Number(e.target.value) }))
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="font-normal">Wieder erreichbar benachrichtigen</Label>
              <Switch
                checked={pref.downRecoveryEnabled}
                onCheckedChange={(c) => setPref((p) => ({ ...p, downRecoveryEnabled: !!c }))}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">Langsame Antwort</p>
            <div className="flex items-center justify-between gap-3">
              <Label className="font-normal">Schwelle (ms, Check-Einstellung)</Label>
              <Input
                type="number"
                min={0}
                className="w-24"
                placeholder="aus"
                value={latencyWarnMs}
                onChange={(e) => setLatencyWarnMs(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="font-normal">Aktiv</Label>
              <Switch
                checked={pref.slowEnabled}
                onCheckedChange={(c) => setPref((p) => ({ ...p, slowEnabled: !!c }))}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label className="font-normal">Verzögerung (Min)</Label>
              <Input
                type="number"
                min={0}
                className="w-24"
                value={pref.slowDelayMin}
                onChange={(e) =>
                  setPref((p) => ({ ...p, slowDelayMin: Number(e.target.value) }))
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="font-normal">Wieder schnell benachrichtigen</Label>
              <Switch
                checked={pref.slowRecoveryEnabled}
                onCheckedChange={(c) => setPref((p) => ({ ...p, slowRecoveryEnabled: !!c }))}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
