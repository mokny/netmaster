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
  containerId: string;
  containerName: string;
  action: "start" | "stop" | "restart";
  trigger: React.ReactElement;
  onDone?: () => void;
}

const LABELS: Record<Props["action"], { title: string; verb: string; description: string }> = {
  start: {
    title: "Container starten?",
    verb: "Starten",
    description: "wird gestartet.",
  },
  stop: {
    title: "Container stoppen?",
    verb: "Stoppen",
    description: "wird gestoppt.",
  },
  restart: {
    title: "Container neu starten?",
    verb: "Neu starten",
    description: "wird neu gestartet.",
  },
};

export function DockerPowerDialog({
  serverId,
  containerId,
  containerName,
  action,
  trigger,
  onDone,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const labels = LABELS[action];

  async function run() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/servers/${serverId}/containers/${containerId}/power`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
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
            „{containerName}“ {labels.description}
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
