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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Trash2, Loader2 } from "lucide-react";
import type { DockerImageDTO } from "@/lib/types";

export function ImageRow({
  serverId,
  image,
  canControl,
  onDone,
}: {
  serverId: string;
  image: DockerImageDTO;
  canControl: boolean;
  onDone?: () => void;
}) {
  const t = useTranslations("docker.imageRow");
  const tErrors = useTranslations("errors");
  const [open, setOpen] = useState(false);
  const [force, setForce] = useState(false);
  const [loading, setLoading] = useState(false);

  async function remove() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/servers/${serverId}/images/${image.imageId}${force ? "?force=true" : ""}`,
        { method: "DELETE" }
      );
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
    <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">
          {image.repository}:{image.tag}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {image.imageId.slice(0, 12)}
          {image.sizeMb != null ? ` · ${image.sizeMb.toFixed(0)} MB` : ""}
          {image.createdLabel ? ` · ${image.createdLabel}` : ""}
        </p>
      </div>
      {canControl && (
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
                {t("deleteDescription", { image: `${image.repository}:${image.tag}` })}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="force-remove">{t("force")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("forceHint")}
                </p>
              </div>
              <Switch id="force-remove" checked={force} onCheckedChange={(c) => setForce(!!c)} />
            </div>
            <DialogFooter>
              <Button variant="destructive" disabled={loading} onClick={remove}>
                {loading && <Loader2 className="size-4 animate-spin" />}
                {t("delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
