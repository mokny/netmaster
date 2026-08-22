"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

const BACKGROUND_JOB_KEYS = [
  "serverMetricsEnabled",
  "dockerContainersEnabled",
  "dockerImagesEnabled",
  "proxmoxVmsEnabled",
  "routerDevicesEnabled",
  "uptimeChecksEnabled",
  "discoveryScanEnabled",
] as const;

const LIVE_VIEW_KEYS = [
  "topologyGraphEnabled",
  "portsEnabled",
  "dashboardLookupsEnabled",
  "wsProcessesEnabled",
] as const;

type ToggleKey = (typeof BACKGROUND_JOB_KEYS)[number] | (typeof LIVE_VIEW_KEYS)[number];

const LABEL_KEYS: Record<ToggleKey, string> = {
  serverMetricsEnabled: "serverMetrics",
  dockerContainersEnabled: "dockerContainers",
  dockerImagesEnabled: "dockerImages",
  proxmoxVmsEnabled: "proxmoxVms",
  routerDevicesEnabled: "routerDevices",
  uptimeChecksEnabled: "uptimeChecks",
  discoveryScanEnabled: "discoveryScan",
  topologyGraphEnabled: "topologyGraph",
  portsEnabled: "ports",
  dashboardLookupsEnabled: "dashboardLookups",
  wsProcessesEnabled: "wsProcesses",
};

type PollingSettingsDTO = Record<ToggleKey, boolean>;

export default function PollingSettingsPage() {
  const t = useTranslations("admin.settings");
  const [settings, setSettings] = useState<PollingSettingsDTO | null>(null);
  const [pending, setPending] = useState<ToggleKey | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/polling-settings")
      .then((res) => (res.ok ? res.json() : { settings: null }))
      .then((data) => {
        if (active) setSettings(data.settings);
      });
    return () => {
      active = false;
    };
  }, []);

  async function toggle(key: ToggleKey, value: boolean) {
    if (!settings) return;
    setPending(key);
    const previous = settings[key];
    setSettings({ ...settings, [key]: value });
    try {
      const res = await fetch("/api/polling-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) {
        setSettings((prev) => (prev ? { ...prev, [key]: previous } : prev));
        return;
      }
      setSettings((await res.json()).settings);
      toast.success(t("saved"));
    } finally {
      setPending(null);
    }
  }

  function renderRow(key: ToggleKey) {
    const labelKey = LABEL_KEYS[key];
    return (
      <div key={key} className="flex items-center justify-between gap-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{t(`${labelKey}Label`)}</p>
          <p className="text-sm text-muted-foreground">{t(`${labelKey}Description`)}</p>
        </div>
        <Switch
          checked={settings?.[key] ?? true}
          disabled={!settings || pending === key}
          onCheckedChange={(checked) => toggle(key, checked)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {!settings ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("backgroundJobsTitle")}</CardTitle>
              <CardDescription>{t("backgroundJobsDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {BACKGROUND_JOB_KEYS.map(renderRow)}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("liveViewsTitle")}</CardTitle>
              <CardDescription>{t("liveViewsDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {LIVE_VIEW_KEYS.map(renderRow)}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
