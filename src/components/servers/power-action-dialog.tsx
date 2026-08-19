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
          data.error ?? (action === "reboot" ? "Neustart fehlgeschlagen" : "Shutdown fehlgeschlagen")
        );
        return;
      }
      toast.success(action === "reboot" ? "Neustart-Befehl gesendet" : "Shutdown-Befehl gesendet");
      setOpenAndReset(false);
      onDone?.();
    } catch {
      toast.error("Verbindung zum Server fehlgeschlagen");
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
            {action === "reboot" ? "Server neu starten?" : "Server herunterfahren?"}
          </DialogTitle>
          <DialogDescription>
            {action === "reboot" ? (
              <>
                „{serverName}“ wird über SSH neu gestartet. Dienste sind für kurze Zeit nicht
                erreichbar.
              </>
            ) : (
              <>
                „{serverName}“ wird ausgeschaltet. netmaster kann den Server danach{" "}
                <strong>nicht</strong> per SSH wieder einschalten — er muss manuell (z.B. per
                Power-Taste oder Remote-Management) neu gestartet werden.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {requiresTyped && (
          <div className="space-y-2">
            <Label>
              Zur Bestätigung Servername eingeben:{" "}
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
            {action === "reboot" ? "Neu starten" : "Herunterfahren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
