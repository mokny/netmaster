"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus } from "lucide-react";

export function GlobalCheckDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifyMe, setNotifyMe] = useState(true);
  const [form, setForm] = useState({
    name: "",
    url: "https://",
    expectedStatus: 200,
    intervalSec: 60,
    timeoutMs: 5000,
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, subscriberUserIds: notifyMe ? undefined : [] }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Speichern fehlgeschlagen");
        return;
      }
      toast.success("Check hinzugefügt");
      setOpen(false);
      setForm({ name: "", url: "https://", expectedStatus: 200, intervalSec: 60, timeoutMs: 5000 });
      onSaved();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="size-4" />
            Check hinzufügen
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>HTTP-Check hinzufügen</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Meine Domain"
            />
          </div>
          <div className="space-y-2">
            <Label>URL</Label>
            <Input
              required
              type="url"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Erw. Status</Label>
              <Input
                type="number"
                value={form.expectedStatus}
                onChange={(e) =>
                  setForm((f) => ({ ...f, expectedStatus: Number(e.target.value) }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Intervall (s)</Label>
              <Input
                type="number"
                value={form.intervalSec}
                onChange={(e) =>
                  setForm((f) => ({ ...f, intervalSec: Number(e.target.value) }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Timeout (ms)</Label>
              <Input
                type="number"
                value={form.timeoutMs}
                onChange={(e) =>
                  setForm((f) => ({ ...f, timeoutMs: Number(e.target.value) }))
                }
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label className="font-normal">Mich bei Ausfall benachrichtigen</Label>
            <Switch checked={notifyMe} onCheckedChange={(c) => setNotifyMe(!!c)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              Hinzufügen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
