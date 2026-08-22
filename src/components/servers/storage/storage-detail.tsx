"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";
import { DisksPanel } from "@/components/servers/storage/disks-panel";
import { NfsPanel } from "@/components/servers/storage/nfs-panel";
import { SambaPanel } from "@/components/servers/storage/samba-panel";
import type { ServerDTO } from "@/lib/types";

export function StorageDetail({ serverId }: { serverId: string }) {
  const t = useTranslations("servers.storage");
  const [server, setServer] = useState<ServerDTO | null>(null);

  useEffect(() => {
    fetch(`/api/servers/${serverId}`)
      .then((res) => res.json())
      .then((data) => setServer(data.server))
      .catch(() => {});
  }, [serverId]);

  if (!server) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/servers/${serverId}`} className={buttonVariants({ variant: "ghost", size: "icon" })}>
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")} – {server.name}
          </h1>
          <p className="text-sm text-muted-foreground">{server.hostname}</p>
        </div>
      </div>

      <Tabs defaultValue="disks">
        <TabsList>
          <TabsTrigger value="disks">{t("tabDisks")}</TabsTrigger>
          <TabsTrigger value="nfs">{t("tabNfs")}</TabsTrigger>
          <TabsTrigger value="samba">{t("tabSamba")}</TabsTrigger>
        </TabsList>
        <TabsContent value="disks" className="mt-4">
          <DisksPanel serverId={serverId} />
        </TabsContent>
        <TabsContent value="nfs" className="mt-4">
          <NfsPanel serverId={serverId} />
        </TabsContent>
        <TabsContent value="samba" className="mt-4">
          <SambaPanel serverId={serverId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
