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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Loader2, Container as ContainerIcon } from "lucide-react";
import type { DockerImageDTO } from "@/lib/types";

interface KeyValue {
  key: string;
  value: string;
}

export function CreateContainerDialog({
  serverId,
  images,
  onDone,
}: {
  serverId: string;
  images: DockerImageDTO[];
  onDone?: () => void;
}) {
  const t = useTranslations("docker.createContainerDialog");
  const tErrors = useTranslations("errors");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [ports, setPorts] = useState<string[]>([]);
  const [envs, setEnvs] = useState<KeyValue[]>([]);
  const [volumes, setVolumes] = useState<string[]>([]);
  const [restartPolicy, setRestartPolicy] = useState<
    "no" | "always" | "unless-stopped" | "on-failure"
  >("unless-stopped");
  const [network, setNetwork] = useState("");
  const [extraArgs, setExtraArgs] = useState("");

  function reset() {
    setName("");
    setImage("");
    setPorts([]);
    setEnvs([]);
    setVolumes([]);
    setRestartPolicy("unless-stopped");
    setNetwork("");
    setExtraArgs("");
  }

  async function run() {
    if (!image.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/containers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          image: image.trim(),
          ports: ports.filter(Boolean),
          envs: envs.filter((e) => e.key.trim()),
          volumes: volumes.filter(Boolean),
          restartPolicy,
          network: network.trim() || undefined,
          extraArgs: extraArgs.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ? tErrors(data.error) : t("createFailed"));
        return;
      }
      toast.success(t("createSuccess"));
      setOpen(false);
      reset();
      onDone?.();
    } catch {
      toast.error(t("connectionFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm">
            <ContainerIcon className="size-4" />
            {t("trigger")}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label>Image</Label>
            <Input
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="nginx:latest"
              list="known-images"
            />
            <datalist id="known-images">
              {images.map((img) => (
                <option key={img.id} value={`${img.repository}:${img.tag}`} />
              ))}
            </datalist>
          </div>

          <div className="space-y-2">
            <Label>{t("nameOptional")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-container" />
          </div>

          <div className="space-y-2">
            <Label>{t("portMappings")}</Label>
            {ports.map((p, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={p}
                  onChange={(e) =>
                    setPorts((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))
                  }
                  placeholder="8080:80"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={() => setPorts((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setPorts((prev) => [...prev, ""])}
            >
              <Plus className="size-4" />
              {t("addPort")}
            </Button>
          </div>

          <div className="space-y-2">
            <Label>{t("envVars")}</Label>
            {envs.map((e, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={e.key}
                  onChange={(ev) =>
                    setEnvs((prev) =>
                      prev.map((v, idx) => (idx === i ? { ...v, key: ev.target.value } : v))
                    )
                  }
                  placeholder="KEY"
                  className="w-1/2"
                />
                <Input
                  value={e.value}
                  onChange={(ev) =>
                    setEnvs((prev) =>
                      prev.map((v, idx) => (idx === i ? { ...v, value: ev.target.value } : v))
                    )
                  }
                  placeholder="value"
                  className="w-1/2"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={() => setEnvs((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setEnvs((prev) => [...prev, { key: "", value: "" }])}
            >
              <Plus className="size-4" />
              {t("addVariable")}
            </Button>
          </div>

          <div className="space-y-2">
            <Label>{t("volumes")}</Label>
            {volumes.map((v, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={v}
                  onChange={(e) =>
                    setVolumes((prev) => prev.map((vv, idx) => (idx === i ? e.target.value : vv)))
                  }
                  placeholder="/host/path:/container/path"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={() => setVolumes((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setVolumes((prev) => [...prev, ""])}
            >
              <Plus className="size-4" />
              {t("addVolume")}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t("restartPolicy")}</Label>
              <Select value={restartPolicy} onValueChange={(v) => setRestartPolicy(v as typeof restartPolicy)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">{t("restartPolicyNo")}</SelectItem>
                  <SelectItem value="unless-stopped">unless-stopped</SelectItem>
                  <SelectItem value="always">always</SelectItem>
                  <SelectItem value="on-failure">on-failure</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("networkModeOptional")}</Label>
              <Input value={network} onChange={(e) => setNetwork(e.target.value)} placeholder="bridge" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              {t("extraFlags")}
              <span className="ml-1 font-normal text-muted-foreground">{t("extraFlagsHint")}</span>
            </Label>
            <textarea
              className="min-h-16 w-full rounded-md border bg-transparent p-2 font-mono text-xs shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={extraArgs}
              onChange={(e) => setExtraArgs(e.target.value)}
              placeholder="--memory 512m --label foo=bar"
            />
          </div>
        </div>

        <DialogFooter>
          <Button disabled={loading || !image.trim()} onClick={run}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
