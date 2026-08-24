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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const BACKGROUND_JOB_KEYS = [
  "serverMetricsEnabled",
  "dockerContainersEnabled",
  "dockerImagesEnabled",
  "proxmoxVmsEnabled",
  "routerDevicesEnabled",
  "uptimeChecksEnabled",
  "discoveryScanEnabled",
  "pingEnabled",
  "advancedPollingEnabled",
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
  pingEnabled: "ping",
  advancedPollingEnabled: "advancedPolling",
  topologyGraphEnabled: "topologyGraph",
  portsEnabled: "ports",
  dashboardLookupsEnabled: "dashboardLookups",
  wsProcessesEnabled: "wsProcesses",
};

type PollingSettingsDTO = Record<ToggleKey, boolean> & {
  pingIntervalSec: number;
  advancedPollingIntervalSec: number;
};

export default function PollingSettingsPage() {
  const t = useTranslations("admin.settings");
  const [settings, setSettings] = useState<PollingSettingsDTO | null>(null);
  const [pending, setPending] = useState<ToggleKey | null>(null);
  const [pingIntervalInput, setPingIntervalInput] = useState("");
  const [pingIntervalSaving, setPingIntervalSaving] = useState(false);
  const [advancedPollingIntervalInput, setAdvancedPollingIntervalInput] = useState("");
  const [advancedPollingIntervalSaving, setAdvancedPollingIntervalSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/polling-settings")
      .then((res) => (res.ok ? res.json() : { settings: null }))
      .then((data) => {
        if (active) {
          setSettings(data.settings);
          if (data.settings) {
            setPingIntervalInput(String(data.settings.pingIntervalSec));
            setAdvancedPollingIntervalInput(String(data.settings.advancedPollingIntervalSec));
          }
        }
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

  async function savePingInterval() {
    if (!settings) return;
    const value = Math.max(5, Number(pingIntervalInput) || settings.pingIntervalSec);
    setPingIntervalSaving(true);
    try {
      const res = await fetch("/api/polling-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pingIntervalSec: value }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setSettings(data.settings);
      setPingIntervalInput(String(data.settings.pingIntervalSec));
      toast.success(t("saved"));
    } finally {
      setPingIntervalSaving(false);
    }
  }

  async function saveAdvancedPollingInterval() {
    if (!settings) return;
    const value = Math.max(
      5,
      Number(advancedPollingIntervalInput) || settings.advancedPollingIntervalSec
    );
    setAdvancedPollingIntervalSaving(true);
    try {
      const res = await fetch("/api/polling-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ advancedPollingIntervalSec: value }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setSettings(data.settings);
      setAdvancedPollingIntervalInput(String(data.settings.advancedPollingIntervalSec));
      toast.success(t("saved"));
    } finally {
      setAdvancedPollingIntervalSaving(false);
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
              <div className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t("pingIntervalLabel")}</p>
                  <p className="text-sm text-muted-foreground">{t("pingIntervalDescription")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="ping-interval-sec" className="sr-only">
                    {t("pingIntervalLabel")}
                  </Label>
                  <Input
                    id="ping-interval-sec"
                    type="number"
                    min={5}
                    className="w-24"
                    value={pingIntervalInput}
                    disabled={!settings}
                    onChange={(e) => setPingIntervalInput(e.target.value)}
                    onBlur={savePingInterval}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                  />
                  {pingIntervalSaving && (
                    <span className="text-xs text-muted-foreground">{t("saving")}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t("advancedPollingIntervalLabel")}</p>
                  <p className="text-sm text-muted-foreground">{t("advancedPollingIntervalDescription")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="advanced-polling-interval-sec" className="sr-only">
                    {t("advancedPollingIntervalLabel")}
                  </Label>
                  <Input
                    id="advanced-polling-interval-sec"
                    type="number"
                    min={5}
                    className="w-24"
                    value={advancedPollingIntervalInput}
                    disabled={!settings}
                    onChange={(e) => setAdvancedPollingIntervalInput(e.target.value)}
                    onBlur={saveAdvancedPollingInterval}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                  />
                  {advancedPollingIntervalSaving && (
                    <span className="text-xs text-muted-foreground">{t("saving")}</span>
                  )}
                </div>
              </div>
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
