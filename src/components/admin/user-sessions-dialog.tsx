"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
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
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ShieldCheck } from "lucide-react";
import type { SessionDTO, UserDTO } from "@/lib/types";

export function UserSessionsDialog({ user }: { user: UserDTO }) {
  const confirm = useConfirm();
  const t = useTranslations("admin.userSessions");
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
      toast.success(t("sessionEnded"));
      load();
    } else {
      toast.error(t("endFailed"));
    }
  }

  async function revokeAll() {
    if (
      !(await confirm({
        title: t("endSessionsTitle"),
        description: t("endSessionsDescription", { name: user.name }),
        confirmText: t("end"),
        variant: "destructive",
      }))
    )
      return;
    const res = await fetch(`/api/users/${user.id}/sessions`, { method: "DELETE" });
    if (res.ok) {
      toast.success(t("allEnded"));
      load();
    } else {
      toast.error(t("endFailed"));
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title", { name: user.name })}</DialogTitle>
        </DialogHeader>
        {sessions === null ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <SessionsList sessions={sessions} onRevoke={revoke} />
        )}
        {sessions !== null && sessions.length > 0 && (
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={revokeAll}>
              {t("endAll")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
