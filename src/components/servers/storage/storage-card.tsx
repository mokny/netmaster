"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { HardDrive, Settings2 } from "lucide-react";

export function StorageCard({ serverId }: { serverId: string }) {
  const t = useTranslations("servers.storageCard");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("cardDescription")}</CardDescription>
        </div>
        <HardDrive className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <Link
          href={`/servers/${serverId}/storage`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Settings2 className="size-4" />
          {t("manage")}
        </Link>
      </CardContent>
    </Card>
  );
}
