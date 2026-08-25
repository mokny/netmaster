"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export default function NasAccountPage() {
  const t = useTranslations("nas.account");
  const tErrors = useTranslations("errors");
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState({ name: "", email: "" });
  const [password, setPassword] = useState("");

  useEffect(() => {
    fetch("/api/nas/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.nasUser) setProfile({ name: data.nasUser.name, email: data.nasUser.email });
      });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const body: Record<string, string> = { name: profile.name, email: profile.email };
      if (password) body.password = password;
      const res = await fetch("/api/nas/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(tErrors(data.error ?? "INTERNAL_ERROR"));
        return;
      }
      toast.success(t("saved"));
      setPassword("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card className="max-w-md p-4">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("name")}</Label>
            <Input
              required
              value={profile.name}
              onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("email")}</Label>
            <Input
              required
              type="email"
              value={profile.email}
              onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("newPassword")}</Label>
            <Input
              type="password"
              minLength={8}
              placeholder={t("passwordKeepHint")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {t("save")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
