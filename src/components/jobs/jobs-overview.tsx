"use client";

import { useTranslations } from "next-intl";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { NetmasterJobsTab } from "@/components/jobs/netmaster-jobs-tab";
import { CronJobsTab } from "@/components/jobs/cron-jobs-tab";

export function JobsOverview() {
  const t = useTranslations("jobs");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <Tabs defaultValue="netmaster">
        <TabsList>
          <TabsTrigger value="netmaster">{t("tabs.netmaster")}</TabsTrigger>
          <TabsTrigger value="cron">{t("tabs.cron")}</TabsTrigger>
        </TabsList>
        <TabsContent value="netmaster" className="pt-4">
          <NetmasterJobsTab />
        </TabsContent>
        <TabsContent value="cron" className="pt-4">
          <CronJobsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
