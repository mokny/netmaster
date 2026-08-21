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
import { Trash2, Loader2 } from "lucide-react";

export function RemoveContainerDialog({
  serverId,
  containerId,
  containerName,
  onDone,
}: {
  serverId: string;
  containerId: string;
  containerName: string;
  onDone?: () => void;
}) {
  const t = useTranslations("docker.removeContainerDialog");
  const tErrors = useTranslations("errors");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/containers/${containerId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ? tErrors(data.error) : t("deleteFailed"));
        return;
      }
      toast.success(t("deleteSuccess"));
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
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" className="size-6" title={t("delete")}>
            <Trash2 className="size-3.5" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("deleteTitle")}</DialogTitle>
          <DialogDescription>
            {t("deleteDescription", { name: containerName })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="destructive" disabled={loading} onClick={run}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {t("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
