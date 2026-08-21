"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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

export function VmPowerDialog({ serverId, vmid, vmName, action, trigger, onDone }: Props) {
  const t = useTranslations("vms.powerDialog");
  const tErrors = useTranslations("errors");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const labels = {
    start: { title: t("startTitle"), verb: t("startVerb"), description: t("startDescription") },
    stop: { title: t("stopTitle"), verb: t("stopVerb"), description: t("stopDescription") },
    reboot: { title: t("rebootTitle"), verb: t("rebootVerb"), description: t("rebootDescription") },
  }[action];

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
        toast.error(data.error ? tErrors(data.error) : t("actionFailed", { verb: labels.verb }));
        return;
      }
      toast.success(t("commandSent", { verb: labels.verb }));
      setOpen(false);
      onDone?.();
    } catch {
      toast.error(t("connectionFailed"));
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
            &ldquo;{vmName}&rdquo; {labels.description}
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
