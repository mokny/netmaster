"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import type { SnippetDTO } from "@/lib/types";

interface FormState {
  id: string | null;
  name: string;
  commandsText: string;
  global: boolean;
}

function emptyForm(global: boolean): FormState {
  return { id: null, name: "", commandsText: "", global };
}

export function ManageSnippetsDialog({
  serverId,
  open,
  onOpenChange,
  onChanged,
}: {
  serverId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [snippets, setSnippets] = useState<SnippetDTO[] | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch(`/api/snippets?serverId=${encodeURIComponent(serverId)}`);
    if (res.ok) setSnippets((await res.json()).snippets);
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function startCreate() {
    setForm(emptyForm(false));
  }

  function startEdit(s: SnippetDTO) {
    setForm({ id: s.id, name: s.name, commandsText: s.commands.join("\n"), global: s.serverId === null });
  }

  async function save() {
    if (!form) return;
    const commands = form.commandsText
      .split("\n")
      .map((c) => c.trim())
      .filter(Boolean);
    if (!form.name.trim() || commands.length === 0) {
      toast.error("Name und mindestens ein Befehl sind erforderlich");
      return;
    }

    setLoading(true);
    try {
      const body = {
        name: form.name.trim(),
        commands,
        serverId: form.global ? null : serverId,
      };
      const res = await fetch(form.id ? `/api/snippets/${form.id}` : "/api/snippets", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Speichern fehlgeschlagen");
        return;
      }
      toast.success(form.id ? "Snippet aktualisiert" : "Snippet angelegt");
      setForm(null);
      load();
      onChanged();
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/snippets/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Löschen fehlgeschlagen");
      return;
    }
    setSnippets((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Snippets verwalten</DialogTitle>
        </DialogHeader>

        {form ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="z.B. Docker aufräumen"
              />
            </div>
            <div className="space-y-2">
              <Label>Befehle (eine Zeile pro Befehl)</Label>
              <textarea
                className="min-h-28 w-full rounded-md border bg-transparent p-2 font-mono text-xs shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.commandsText}
                onChange={(e) => setForm({ ...form, commandsText: e.target.value })}
                placeholder={"docker system prune -f\ndf -h"}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <Label className="font-normal">Global (auf jedem Server nutzbar)</Label>
              <input
                type="checkbox"
                checked={form.global}
                onChange={(e) => setForm({ ...form, global: e.target.checked })}
                className="size-4"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setForm(null)}>
                <X className="size-4" />
                Abbrechen
              </Button>
              <Button type="button" onClick={save} disabled={loading}>
                {loading && <Loader2 className="size-4 animate-spin" />}
                Speichern
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              {snippets === null ? (
                <p className="text-sm text-muted-foreground">Lädt…</p>
              ) : snippets.length === 0 ? (
                <p className="text-sm text-muted-foreground">Noch keine Snippets angelegt.</p>
              ) : (
                snippets.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{s.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.serverId === null ? "Global" : "Dieser Server"} ·{" "}
                        {s.commands.length} Befehl{s.commands.length > 1 ? "e" : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => startEdit(s)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => remove(s.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <DialogFooter>
              <Button type="button" onClick={startCreate}>
                <Plus className="size-4" />
                Neues Snippet
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
