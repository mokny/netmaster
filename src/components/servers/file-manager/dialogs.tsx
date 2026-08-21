"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { modeToOctal } from "./utils";

export function PromptDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  initialValue = "",
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  initialValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
}) {
  const t = useTranslations("servers.fileManager.dialogs");
  const [value, setValue] = useState(initialValue);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValue(initialValue);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="prompt-dialog-input">{label}</Label>
          <Input
            id="prompt-dialog-input"
            value={value}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.trim()) {
                onConfirm(value.trim());
                onOpenChange(false);
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            disabled={!value.trim()}
            onClick={() => {
              onConfirm(value.trim());
              onOpenChange(false);
            }}
          >
            {confirmLabel ?? t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ChmodDialog({
  open,
  onOpenChange,
  path,
  initialMode,
  onConfirmChmod,
  onConfirmChown,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  path: string;
  initialMode: number;
  onConfirmChmod: (mode: string) => void;
  onConfirmChown: (uid: number, gid: number) => void;
}) {
  const t = useTranslations("servers.fileManager.dialogs");
  const [mode, setMode] = useState(modeToOctal(initialMode));
  const [uid, setUid] = useState("");
  const [gid, setGid] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMode(modeToOctal(initialMode));
      setUid("");
      setGid("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("chmodTitle")}</DialogTitle>
          <DialogDescription className="break-all">{path}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="chmod-mode">{t("chmodModeLabel")}</Label>
            <div className="flex gap-2">
              <Input
                id="chmod-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value.replace(/[^0-7]/g, "").slice(0, 4))}
                className="w-28"
              />
              <Button variant="outline" onClick={() => onConfirmChmod(mode)} disabled={!mode}>
                {t("apply")}
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-2 border-t pt-4">
            <Label>{t("chownLabel")}</Label>
            <div className="flex gap-2">
              <Input
                placeholder="UID"
                value={uid}
                onChange={(e) => setUid(e.target.value.replace(/\D/g, ""))}
                className="w-24"
              />
              <Input
                placeholder="GID"
                value={gid}
                onChange={(e) => setGid(e.target.value.replace(/\D/g, ""))}
                className="w-24"
              />
              <Button
                variant="outline"
                disabled={!uid || !gid}
                onClick={() => onConfirmChown(Number(uid), Number(gid))}
              >
                {t("apply")}
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type ConflictChoice = "overwrite" | "rename" | "cancel";

export function ConflictDialog({
  open,
  onOpenChange,
  name,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onChoose: (choice: ConflictChoice) => void;
}) {
  const t = useTranslations("servers.fileManager.dialogs");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("conflictTitle")}</DialogTitle>
          <DialogDescription className="break-all">
            {t("conflictDescription", { name })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onChoose("cancel")}>
            {t("cancel")}
          </Button>
          <Button variant="outline" onClick={() => onChoose("rename")}>
            {t("rename")}
          </Button>
          <Button variant="destructive" onClick={() => onChoose("overwrite")}>
            {t("overwrite")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = true,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  const t = useTranslations("servers.fileManager.dialogs");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="break-all">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel ?? t("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
