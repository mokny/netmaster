"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SessionsList } from "@/components/account/sessions-list";
import { ShieldCheck } from "lucide-react";
import type { SessionDTO, UserDTO } from "@/lib/types";

export function UserSessionsDialog({ user }: { user: UserDTO }) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionDTO[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/users/${user.id}/sessions`);
    if (res.ok) setSessions((await res.json()).sessions);
  }, [user.id]);

  async function revoke(sessionId: string) {
    const res = await fetch(`/api/users/${user.id}/sessions/${sessionId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Session beendet");
      load();
    } else {
      toast.error("Beenden fehlgeschlagen");
    }
  }

  async function revokeAll() {
    if (!confirm(`Alle Sessions von ${user.name} wirklich beenden?`)) return;
    const res = await fetch(`/api/users/${user.id}/sessions`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Alle Sessions beendet");
      load();
    } else {
      toast.error("Beenden fehlgeschlagen");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) load();
        else setSessions(null);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" className="size-7">
            <ShieldCheck className="size-3.5" />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sessions von {user.name}</DialogTitle>
        </DialogHeader>
        {sessions === null ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <SessionsList sessions={sessions} onRevoke={revoke} />
        )}
        {sessions !== null && sessions.length > 0 && (
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={revokeAll}>
              Alle beenden
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
