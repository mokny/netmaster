"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface Props {
  serverId: string;
  vmid: number;
  vmName: string;
  action: "start" | "stop" | "reboot";
  trigger: React.ReactElement;
  onDone?: () => void;
}

const LABELS: Record<Props["action"], { title: string; verb: string; description: string }> = {
  start: {
    title: "VM starten?",
    verb: "Starten",
    description: "wird gestartet.",
  },
  stop: {
    title: "VM stoppen?",
    verb: "Stoppen",
    description: "wird sofort gestoppt (kein sauberes Herunterfahren).",
  },
  reboot: {
    title: "VM neu starten?",
    verb: "Neu starten",
    description: "wird neu gestartet.",
  },
};

export function VmPowerDialog({ serverId, vmid, vmName, action, trigger, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const labels = LABELS[action];

  async function run() {
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/vms/${vmid}/power`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? `${labels.verb} fehlgeschlagen`);
        return;
      }
      toast.success(`${labels.verb}-Befehl gesendet`);
      setOpen(false);
      onDone?.();
    } catch {
      toast.error("Verbindung zum Server fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>
            „{vmName}“ {labels.description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant={action === "stop" ? "destructive" : "default"}
            disabled={loading}
            onClick={run}
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {labels.verb}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
