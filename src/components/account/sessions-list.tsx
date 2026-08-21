"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatUserAgent } from "@/lib/user-agent";
import { Monitor, LogOut } from "lucide-react";
import type { SessionDTO } from "@/lib/types";

export function SessionsList({
  sessions,
  onRevoke,
}: {
  sessions: SessionDTO[];
  onRevoke: (id: string) => void;
}) {
  const t = useTranslations("account.sessionsList");

  if (sessions.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <ul className="divide-y rounded-md border">
      {sessions.map((s) => (
        <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
          <Monitor className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium">{formatUserAgent(s.userAgent)}</p>
              {s.isCurrent && (
                <Badge variant="secondary" className="shrink-0">
                  {t("thisDevice")}
                </Badge>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {t("lastActive", { time: new Date(s.lastSeenAt).toLocaleString() })} ·{" "}
              {t("signedInSince", { date: new Date(s.createdAt).toLocaleDateString() })}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={() => onRevoke(s.id)}
            aria-label={t("endSession")}
          >
            <LogOut className="size-3.5" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
