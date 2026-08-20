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
        toast.error(data.error ?? "Erstellen fehlgeschlagen");
        return;
      }
      toast.success("Container erstellt");
      setOpen(false);
      reset();
      onDone?.();
    } catch {
      toast.error("Verbindung zum Server fehlgeschlagen");
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
            Container erstellen
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Container erstellen</DialogTitle>
          <DialogDescription>Führt „docker run -d“ auf dem Server aus.</DialogDescription>
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
            <Label>Name (optional)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="mein-container" />
          </div>

          <div className="space-y-2">
            <Label>Port-Mappings</Label>
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
              Port hinzufügen
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Umgebungsvariablen</Label>
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
              Variable hinzufügen
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Volumes (Bind-Mounts)</Label>
            {volumes.map((v, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={v}
                  onChange={(e) =>
                    setVolumes((prev) => prev.map((vv, idx) => (idx === i ? e.target.value : vv)))
                  }
                  placeholder="/host/pfad:/container/pfad"
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
              Volume hinzufügen
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Restart-Policy</Label>
              <Select value={restartPolicy} onValueChange={(v) => setRestartPolicy(v as typeof restartPolicy)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">Kein Neustart</SelectItem>
                  <SelectItem value="unless-stopped">unless-stopped</SelectItem>
                  <SelectItem value="always">always</SelectItem>
                  <SelectItem value="on-failure">on-failure</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Netzwerk-Modus (optional)</Label>
              <Input value={network} onChange={(e) => setNetwork(e.target.value)} placeholder="bridge" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              Zusätzliche docker-run-Flags (optional)
              <span className="ml-1 font-normal text-muted-foreground">für Power-User</span>
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
            Erstellen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
