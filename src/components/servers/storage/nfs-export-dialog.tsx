"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

export interface NfsExport {
  path: string;
  client: string;
  options: string;
}

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "ERROR");
  return data;
}

export interface NfsExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Fester Ziel-Server (Server-eigenes Storage-Panel) - wenn gesetzt, keine
  // Server-Auswahl im Dialog.
  serverId?: string;
  // Auswählbare Server (globale Storage-Übersicht) - nur relevant beim
  // Neuanlegen; beim Bearbeiten ist der Server durch initialExport fixiert.
  serverOptions?: { id: string; name: string }[];
  initialExport: (NfsExport & { serverId: string }) | null;
  onSaved: () => void;
}

export function NfsExportDialog({
  open,
  onOpenChange,
  serverId,
  serverOptions,
  initialExport,
  onSaved,
}: NfsExportDialogProps) {
  const t = useTranslations("servers.storage.nfs");
  const tErrors = useTranslations("errors");
  const isEdit = !!initialExport;
  const fixedServerId = serverId ?? initialExport?.serverId ?? null;
  const showServerPicker = !fixedServerId && !!serverOptions?.length;

  const [selectedServerId, setSelectedServerId] = useState(
    fixedServerId ?? serverOptions?.[0]?.id ?? ""
  );
  const [path, setPath] = useState("/srv/export");
  const [client, setClient] = useState("*");
  const [options, setOptions] = useState("rw,sync,no_subtree_check");
  const [saving, setSaving] = useState(false);

  const effectiveServerId = fixedServerId ?? selectedServerId;

  // Dialog bleibt dauerhaft gemountet - Formular bei jedem (Wieder-)Öffnen
  // aus initialExport neu aufbauen, analog zum Muster in
  // server-form-dialog.tsx.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setSelectedServerId(fixedServerId ?? serverOptions?.[0]?.id ?? "");
      setPath(initialExport?.path ?? "/srv/export");
      setClient(initialExport?.client ?? "*");
      setOptions(initialExport?.options ?? "rw,sync,no_subtree_check");
    }
  }

  async function submit() {
    if (!effectiveServerId) return;
    setSaving(true);
    try {
      // Bearbeiten eines Exports mit geändertem Client: der alte (path,
      // client)-Eintrag muss zuerst entfernt werden, sonst bleiben zwei
      // Exports für denselben Pfad stehen (addExport dedupliziert nur nach
      // dem *neuen* path+client-Paar).
      if (isEdit && initialExport && initialExport.client !== client) {
        await api(`/api/servers/${effectiveServerId}/storage/nfs/exports`, {
          method: "DELETE",
          body: JSON.stringify({ path: initialExport.path, client: initialExport.client }),
        });
      }
      await api(`/api/servers/${effectiveServerId}/storage/nfs/exports`, {
        method: "POST",
        body: JSON.stringify({ path, client, options }),
      });
      toast.success(t("exportAdded"));
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? tErrors(err.message) ?? t("exportAddFailed") : t("exportAddFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editExportTitle") : t("newExportTitle")}</DialogTitle>
          <DialogDescription>{t("serverDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {showServerPicker && (
            <div className="space-y-1">
              <Label>{t("targetServer")}</Label>
              <Select value={selectedServerId} onValueChange={(v) => setSelectedServerId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {serverOptions!.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {fixedServerId && isEdit && serverOptions && (
            <p className="text-xs text-muted-foreground">
              {t("targetServer")}: {serverOptions.find((s) => s.id === fixedServerId)?.name ?? fixedServerId}
            </p>
          )}

          <div className="space-y-1">
            <Label>{t("colPath")}</Label>
            <Input value={path} onChange={(e) => setPath(e.target.value)} disabled={isEdit} />
          </div>
          <div className="space-y-1">
            <Label>{t("colClient")}</Label>
            <Input value={client} onChange={(e) => setClient(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t("colOptions")}</Label>
            <Input value={options} onChange={(e) => setOptions(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={saving || !path || !client || !effectiveServerId}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {t("addExport")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
