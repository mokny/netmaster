"use client";

import { cloneElement, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  hasRootAccess: boolean;
  dockerEnabled: boolean;
  trigger: React.ReactElement<{ disabled?: boolean }>;
  onDone?: () => void;
}

interface Selection {
  apt: boolean;
  docker: boolean;
  dockerVolumes: boolean;
  journal: boolean;
  journalDays: number;
}

function selectionKey(sel: Selection): string {
  return JSON.stringify(sel);
}

export function CleanupDialog({ serverId, hasRootAccess, dockerEnabled, trigger, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Selection>({
    apt: true,
    docker: dockerEnabled,
    dockerVolumes: false,
    journal: true,
    journalDays: 7,
  });
  const [loading, setLoading] = useState<"preview" | "run" | null>(null);
  const [previewedKey, setPreviewedKey] = useState<string | null>(null);
  const [log, setLog] = useState<string | null>(null);
  const [errorLog, setErrorLog] = useState<string | null>(null);

  const hasSelection = sel.apt || sel.docker || sel.journal;
  const canRun = hasSelection && previewedKey === selectionKey(sel);

  function setOpenAndReset(next: boolean) {
    setOpen(next);
    if (!next) {
      setLog(null);
      setErrorLog(null);
      setPreviewedKey(null);
    }
  }

  function update<K extends keyof Selection>(key: K, value: Selection[K]) {
    setSel((prev) => ({ ...prev, [key]: value }));
  }

  async function run(dryRun: boolean) {
    setLoading(dryRun ? "preview" : "run");
    try {
      const res = await fetch(`/api/servers/${serverId}/cleanup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sel, dryRun }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Bereinigung fehlgeschlagen");
        return;
      }
      setLog(data.output || "(keine Ausgabe)");
      setErrorLog(data.errorOutput || null);
      if (dryRun) {
        setPreviewedKey(selectionKey(sel));
        toast.success("Vorschau erstellt");
      } else {
        setPreviewedKey(null);
        toast.success("Bereinigung ausgeführt");
        onDone?.();
      }
    } catch {
      toast.error("Verbindung zum Server fehlgeschlagen");
    } finally {
      setLoading(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpenAndReset}>
      {hasRootAccess ? (
        <DialogTrigger render={trigger} />
      ) : (
        <Tooltip>
          <TooltipTrigger render={<span />}>
            {cloneElement(trigger, { disabled: true })}
          </TooltipTrigger>
          <TooltipContent>
            Erfordert root-SSH-Zugang oder ein hinterlegtes Sudo-Passwort (siehe „Bearbeiten“)
          </TooltipContent>
        </Tooltip>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Festplattenspeicher bereinigen</DialogTitle>
          <DialogDescription>
            Erst „Vorschau“ ausführen, um zu sehen was passieren würde, danach „Jetzt
            ausführen“, um die Bereinigung tatsächlich durchzuführen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="cleanup-apt"
                checked={sel.apt}
                onCheckedChange={(c) => update("apt", !!c)}
              />
              <Label htmlFor="cleanup-apt" className="font-normal">
                APT: verwaiste Pakete entfernen (autoremove) & Paket-Cache leeren
              </Label>
            </div>

            {dockerEnabled && (
              <>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="cleanup-docker"
                    checked={sel.docker}
                    onCheckedChange={(c) => update("docker", !!c)}
                  />
                  <Label htmlFor="cleanup-docker" className="font-normal">
                    Docker: ungenutzte Images, Container, Netzwerke & Build-Cache entfernen
                  </Label>
                </div>
                <div className="ml-6 flex items-center gap-2">
                  <Checkbox
                    id="cleanup-docker-volumes"
                    checked={sel.dockerVolumes}
                    disabled={!sel.docker}
                    onCheckedChange={(c) => update("dockerVolumes", !!c)}
                  />
                  <Label
                    htmlFor="cleanup-docker-volumes"
                    className="font-normal text-muted-foreground"
                  >
                    Ungenutzte Volumes einschließen (kann Daten löschen)
                  </Label>
                </div>
              </>
            )}

            <div className="flex items-center gap-2">
              <Checkbox
                id="cleanup-journal"
                checked={sel.journal}
                onCheckedChange={(c) => update("journal", !!c)}
              />
              <Label htmlFor="cleanup-journal" className="font-normal">
                Systemd-Journal-Logs kürzen, älter als
              </Label>
              <Select
                value={String(sel.journalDays)}
                onValueChange={(v) => update("journalDays", Number(v))}
                disabled={!sel.journal}
              >
                <SelectTrigger size="sm" className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Tag</SelectItem>
                  <SelectItem value="7">7 Tagen</SelectItem>
                  <SelectItem value="30">30 Tagen</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {log !== null && (
            <pre className="max-h-56 overflow-auto rounded-md border bg-muted p-2 text-xs whitespace-pre-wrap">
              {log}
              {errorLog && `\n${errorLog}`}
            </pre>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={loading !== null || !hasSelection}
            onClick={() => run(true)}
          >
            {loading === "preview" && <Loader2 className="size-4 animate-spin" />}
            Vorschau
          </Button>
          <Button
            variant="destructive"
            disabled={loading !== null || !canRun}
            onClick={() => run(false)}
          >
            {loading === "run" && <Loader2 className="size-4 animate-spin" />}
            Jetzt ausführen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
