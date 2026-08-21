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
import { Loader2 } from "lucide-react";

interface Props {
  serverId: string;
  serverName: string;
  action: "reboot" | "shutdown";
  trigger?: React.ReactElement;
  onDone?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

// Shutdown lässt sich per SSH nicht rückgängig machen (kein Wake-on-LAN),
// daher zusätzliche Hürde: Servername muss exakt eingetippt werden.
export function PowerActionDialog({
  serverId,
  serverName,
  action,
  trigger,
  onDone,
  open: openProp,
  onOpenChange,
}: Props) {
  const t = useTranslations("servers.power");
  const tErrors = useTranslations("errors");
  const controlled = openProp !== undefined;
  const [openState, setOpenState] = useState(false);
  const open = controlled ? openProp : openState;
  const [loading, setLoading] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const requiresTyped = action === "shutdown";

  function setOpenAndReset(next: boolean) {
    if (controlled) {
      onOpenChange?.(next);
    } else {
      setOpenState(next);
    }
    if (!next) setConfirmText("");
  }

  async function run() {
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/power`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(
          data.error ? tErrors(data.error) : (action === "reboot" ? t("rebootFailed") : t("shutdownFailed"))
        );
        return;
      }
      toast.success(action === "reboot" ? t("rebootSent") : t("shutdownSent"));
      setOpenAndReset(false);
      onDone?.();
    } catch {
      toast.error(t("connectionFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpenAndReset}>
      {(!controlled || trigger) && <DialogTrigger render={trigger} />}
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {action === "reboot" ? t("rebootTitle") : t("shutdownTitle")}
          </DialogTitle>
          <DialogDescription>
            {action === "reboot" ? (
              t("rebootDescription", { name: serverName })
            ) : (
              t.rich("shutdownDescription", {
                name: serverName,
                strong: (chunks) => <strong>{chunks}</strong>,
              })
            )}
          </DialogDescription>
        </DialogHeader>
        {requiresTyped && (
          <div className="space-y-2">
            <Label>
              {t("confirmNamePrompt")}{" "}
              <span className="font-mono text-foreground">{serverName}</span>
            </Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
            />
          </div>
        )}
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={loading || (requiresTyped && confirmText !== serverName)}
            onClick={run}
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {action === "reboot" ? t("rebootAction") : t("shutdownAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
