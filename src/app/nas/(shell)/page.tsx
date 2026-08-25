"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderOpen } from "lucide-react";

interface NasShareSummary {
  id: string;
  name: string;
  role: "READ_ONLY" | "READ_WRITE";
  quotaBytes: string | null;
  usedBytes: string;
  readOnlyLocked: boolean;
  mountActive: boolean;
}

function formatBytes(value: string | null): string {
  if (value === null) return "–";
  const gb = Number(value) / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)} GB`;
}

export default function NasDashboardPage() {
  const t = useTranslations("nas.dashboard");
  const [shares, setShares] = useState<NasShareSummary[] | null>(null);

  useEffect(() => {
    fetch("/api/nas/shares")
      .then((res) => (res.ok ? res.json() : { shares: [] }))
      .then((data) => setShares(data.shares));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {shares === null ? (
        <Skeleton className="h-40 w-full" />
      ) : shares.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noShares")}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {shares.map((s) => (
            <Link key={s.id} href={`/nas/files/${s.id}`}>
              <Card className="p-4 transition-colors hover:bg-accent">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium">
                    <FolderOpen className="size-4" />
                    {s.name}
                  </div>
                  <Badge variant="secondary">{t(`role.${s.role}`)}</Badge>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {formatBytes(s.usedBytes)} / {s.quotaBytes ? formatBytes(s.quotaBytes) : t("unlimited")}
                </div>
                {s.readOnlyLocked && (
                  <Badge variant="destructive" className="mt-2">
                    {t("quotaExceeded")}
                  </Badge>
                )}
                {!s.mountActive && (
                  <Badge variant="outline" className="mt-2 ml-2">
                    {t("mountUnavailable")}
                  </Badge>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
