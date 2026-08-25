"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Loader2, FolderLock } from "lucide-react";

function goAfterLogin(
  router: ReturnType<typeof useRouter>,
  redirectTo: string,
  nasUser: { mustChangePassword: boolean }
) {
  router.push(nasUser.mustChangePassword ? "/nas/change-password" : redirectTo);
  router.refresh();
}

export function NasLoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const t = useTranslations("nas.auth");
  const tErrors = useTranslations("errors");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [preAuthToken, setPreAuthToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (preAuthToken) {
        const res = await fetch("/api/nas/auth/login/totp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preAuthToken, code: totpCode }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(tErrors(data.error ?? "INTERNAL_ERROR"));
          return;
        }
        goAfterLogin(router, redirectTo, data.nasUser);
        return;
      }

      const res = await fetch("/api/nas/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(tErrors(data.error ?? "INTERNAL_ERROR"));
        return;
      }
      if (data.requiresTotp) {
        setPreAuthToken(data.preAuthToken);
        return;
      }
      goAfterLogin(router, redirectTo, data.nasUser);
    } catch {
      setError(t("connectionFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <FolderLock className="size-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("tagline")}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {preAuthToken ? (
          <div className="space-y-2">
            <Label htmlFor="totpCode">{t("confirmationCode")}</Label>
            <Input
              id="totpCode"
              type="text"
              inputMode="text"
              autoComplete="one-time-code"
              autoFocus
              required
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
            />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="size-4 animate-spin" />}
          {preAuthToken ? t("confirm") : t("login")}
        </Button>
        {preAuthToken && (
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              setPreAuthToken(null);
              setTotpCode("");
              setError(null);
            }}
          >
            {t("back")}
          </Button>
        )}
      </form>

      <div className="flex justify-center pt-2">
        <LanguageSwitcher />
      </div>
    </div>
  );
}
