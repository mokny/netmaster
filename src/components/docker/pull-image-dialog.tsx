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
import { Download, Loader2 } from "lucide-react";

export function PullImageDialog({
  serverId,
  onDone,
}: {
  serverId: string;
  onDone?: () => void;
}) {
  const t = useTranslations("docker.pullImageDialog");
  const tErrors = useTranslations("errors");
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState("");
  const [loading, setLoading] = useState(false);

  async function run() {
    if (!image.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: image.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ? tErrors(data.error) : t("pullFailed"));
        return;
      }
      toast.success(t("pullSuccess", { image: image.trim() }));
      setOpen(false);
      setImage("");
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
          <Button size="sm">
            <Download className="size-4" />
            {t("trigger")}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Image</Label>
          <Input
            autoFocus
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="nginx:latest"
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
          />
        </div>
        <DialogFooter>
          <Button disabled={loading || !image.trim()} onClick={run}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {t("pull")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
