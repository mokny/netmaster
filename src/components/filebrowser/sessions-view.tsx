"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, LogOut, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { fbMe, fbSessions, fbRevokeSession, fbRevokeOtherSessions } from "./api-client";
import { FbApiError, type FbSessionInfo } from "./types";
import { fbErrorMessage, formatRelativeTime } from "./format";

export function FilebrowserSessionsView({ serverId }: { serverId: string }) {
  const router = useRouter();
  const confirm = useConfirm();

  const [ready, setReady] = useState(false);
  const [sessions, setSessions] = useState<FbSessionInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    fbMe(serverId)
      .then(() => setReady(true))
      .catch(() => router.replace(`/filebrowser/${serverId}/login`));
  }, [serverId, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fbSessions(serverId);
      setSessions(data.sessions);
    } catch (err) {
      toast.error(err instanceof FbApiError ? fbErrorMessage(err.code) : "Fehler beim Laden.");
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  async function revoke(session: FbSessionInfo) {
    setBusyId(session.id);
    try {
      await fbRevokeSession(serverId, session.id);
      toast.success("Sitzung beendet.");
      load();
    } catch (err) {
      toast.error(err instanceof FbApiError ? fbErrorMessage(err.code) : "Beenden fehlgeschlagen.");
    } finally {
      setBusyId(null);
    }
  }

  async function revokeOthers() {
    if (
      !(await confirm({
        title: "Alle anderen Geräte abmelden",
        description: "Auf allen anderen Geräten wird eine erneute Anmeldung nötig.",
      }))
    )
      return;
    try {
      const { revoked } = await fbRevokeOtherSessions(serverId);
      toast.success(`${revoked} Sitzung(en) beendet.`);
      load();
    } catch (err) {
      toast.error(err instanceof FbApiError ? fbErrorMessage(err.code) : "Abmelden fehlgeschlagen.");
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasOthers = (sessions?.length ?? 0) > 1;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-3 py-2.5 backdrop-blur">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push(`/filebrowser/${serverId}`)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="flex-1 text-sm font-medium">Sitzungen</h1>
        {hasOthers && (
          <Button variant="outline" size="sm" onClick={revokeOthers}>
            <LogOut className="size-4" /> Alle anderen Geräte abmelden
          </Button>
        )}
      </header>

      <div className="flex-1 px-2 py-2">
        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && sessions?.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">Keine aktiven Sitzungen.</p>
        )}
        {!loading && (
          <div className="space-y-0.5">
            {sessions?.map((session) => (
              <div key={session.id} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted">
                <Smartphone className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm">
                    {session.userAgent || "Unbekanntes Gerät"}
                    {session.isCurrent && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        Diese Sitzung
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">zuletzt aktiv {formatRelativeTime(session.lastSeenAt)}</p>
                </div>
                {!session.isCurrent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busyId === session.id}
                    onClick={() => revoke(session)}
                  >
                    {busyId === session.id ? <Loader2 className="size-4 animate-spin" /> : "Beenden"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
