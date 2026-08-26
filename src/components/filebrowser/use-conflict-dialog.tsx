"use client";

import { useCallback, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export interface ConflictResult {
  mode: "overwrite" | "rename" | "cancel";
  applyToAll: boolean;
}

// Promise-basierter Konflikt-Dialog (Overwrite/Auto-rename/Abbrechen) mit
// "Für alle übernehmen"-Checkbox für Batch-Operationen (Upload/Verschieben/
// Kopieren mehrerer Elemente) - Aufrufer entscheidet selbst, ob applyToAll
// für nachfolgende Konflikte im selben Batch respektiert wird.
export function useConflictDialog() {
  const [state, setState] = useState<{ name: string; open: boolean } | null>(null);
  const [applyToAll, setApplyToAll] = useState(false);
  const resolveRef = useRef<((r: ConflictResult) => void) | null>(null);

  const ask = useCallback((name: string): Promise<ConflictResult> => {
    return new Promise((resolve) => {
      setApplyToAll(false);
      setState({ name, open: true });
      resolveRef.current = resolve;
    });
  }, []);

  const settle = useCallback(
    (mode: ConflictResult["mode"]) => {
      setState((s) => (s ? { ...s, open: false } : s));
      resolveRef.current?.({ mode, applyToAll });
      resolveRef.current = null;
    },
    [applyToAll]
  );

  const dialog = (
    <Dialog open={!!state?.open} onOpenChange={(open) => !open && settle("cancel")}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Element existiert bereits</DialogTitle>
          <DialogDescription>
            &bdquo;{state?.name}&ldquo; existiert am Ziel bereits. Wie soll verfahren werden?
          </DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={applyToAll} onCheckedChange={(c) => setApplyToAll(!!c)} />
          Für alle weiteren Konflikte in dieser Aktion übernehmen
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => settle("cancel")}>
            Abbrechen
          </Button>
          <Button variant="secondary" onClick={() => settle("rename")}>
            Umbenennen
          </Button>
          <Button variant="destructive" onClick={() => settle("overwrite")}>
            Überschreiben
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { ask, dialog };
}
