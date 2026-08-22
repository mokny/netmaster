"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HistoryInput } from "@/components/tools/history-input";
import { useToolHistory } from "@/lib/use-tool-history";
import { Loader2 } from "lucide-react";

interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

function ToolResultView({ result }: { result: ToolResult | null }) {
  const t = useTranslations("tools");
  if (!result) {
    return <p className="text-sm text-muted-foreground">{t("noResultYet")}</p>;
  }
  return (
    <pre
      className={`max-h-80 overflow-auto rounded-md border p-3 text-xs whitespace-pre-wrap ${
        result.success ? "bg-muted/50" : "border-destructive/40 bg-destructive/5 text-destructive"
      }`}
    >
      {result.output || result.error || ""}
    </pre>
  );
}

function HostToolCard({ toolKey }: { toolKey: "ping" | "traceroute" | "whois" | "dns" }) {
  const t = useTranslations("tools");
  const [host, setHost] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ToolResult | null>(null);
  const { history: hostHistory, addEntry: addHostEntry } = useToolHistory("host");

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!host.trim()) return;
    addHostEntry(host);
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/tools/${toolKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: host.trim() }),
      });
      const data = await res.json();
      setResult(data.result ?? { success: false, output: "", error: data.error });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(`${toolKey}.title`)}</CardTitle>
        <CardDescription>{t(`${toolKey}.description`)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={run} className="flex gap-2">
          <HistoryInput
            value={host}
            onValueChange={setHost}
            history={hostHistory}
            emptyLabel={t("noHistory")}
            placeholder={t("hostPlaceholder")}
            required
          />
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {t("run")}
          </Button>
        </form>
        <ToolResultView result={result} />
      </CardContent>
    </Card>
  );
}

function PortCheckCard() {
  const t = useTranslations("tools");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ToolResult | null>(null);
  const { history: hostHistory, addEntry: addHostEntry } = useToolHistory("host");
  const { history: portHistory, addEntry: addPortEntry } = useToolHistory("port");

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!host.trim() || !port) return;
    addHostEntry(host);
    addPortEntry(port);
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/tools/port", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: host.trim(), port: Number(port) }),
      });
      const data = await res.json();
      setResult(data.result ?? { success: false, output: "", error: data.error });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("portCheck.title")}</CardTitle>
        <CardDescription>{t("portCheck.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={run} className="flex gap-2">
          <HistoryInput
            value={host}
            onValueChange={setHost}
            history={hostHistory}
            emptyLabel={t("noHistory")}
            placeholder={t("hostPlaceholder")}
            className="flex-1"
            required
          />
          <HistoryInput
            value={port}
            onValueChange={setPort}
            history={portHistory}
            emptyLabel={t("noHistory")}
            placeholder={t("port")}
            type="number"
            min={1}
            max={65535}
            className="w-24"
            required
          />
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {t("run")}
          </Button>
        </form>
        <ToolResultView result={result} />
      </CardContent>
    </Card>
  );
}

function HttpCheckCard() {
  const t = useTranslations("tools");
  const [url, setUrl] = useState("https://");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ToolResult | null>(null);
  const { history: urlHistory, addEntry: addUrlEntry } = useToolHistory("url");

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    const trimmedUrl = url.trim();
    if (trimmedUrl !== "http://" && trimmedUrl !== "https://") {
      addUrlEntry(trimmedUrl);
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/tools/http", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      setResult(data.result ?? { success: false, output: "", error: data.error });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("http.title")}</CardTitle>
        <CardDescription>{t("http.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={run} className="flex gap-2">
          <HistoryInput
            value={url}
            onValueChange={setUrl}
            history={urlHistory}
            emptyLabel={t("noHistory")}
            placeholder={t("urlPlaceholder")}
            type="url"
            required
          />
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {t("run")}
          </Button>
        </form>
        <ToolResultView result={result} />
      </CardContent>
    </Card>
  );
}

export function ToolsPanel() {
  const t = useTranslations("tools");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <HostToolCard toolKey="ping" />
        <HostToolCard toolKey="traceroute" />
        <HostToolCard toolKey="whois" />
        <HostToolCard toolKey="dns" />
        <PortCheckCard />
        <HttpCheckCard />
      </div>
    </div>
  );
}
