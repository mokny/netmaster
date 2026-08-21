"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { startAuthentication } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Loader2, Network, Fingerprint } from "lucide-react";

function goAfterLogin(
  router: ReturnType<typeof useRouter>,
  redirectTo: string,
  user: { mustChangePassword: boolean }
) {
  router.push(user.mustChangePassword ? "/change-password" : redirectTo);
  router.refresh();
}

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const t = useTranslations("auth");
  const tErrors = useTranslations("errors");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [preAuthToken, setPreAuthToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (preAuthToken) {
        const res = await fetch("/api/auth/login/totp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preAuthToken, code: totpCode }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(tErrors(data.error ?? "INTERNAL_ERROR"));
          return;
        }
        goAfterLogin(router, redirectTo, data.user);
        return;
      }

      const res = await fetch("/api/auth/login", {
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
      goAfterLogin(router, redirectTo, data.user);
    } catch {
      setError(t("connectionFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function onPasskeyLogin() {
    setError(null);
    setPasskeyLoading(true);
    try {
      const optionsRes = await fetch("/api/auth/webauthn/login/options", { method: "POST" });
      const options = await optionsRes.json();
      if (!optionsRes.ok) {
        setError(tErrors(options.error ?? "PASSKEY_LOGIN_FAILED"));
        return;
      }

      const response = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch("/api/auth/webauthn/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      const data = await verifyRes.json();
      if (!verifyRes.ok) {
        setError(tErrors(data.error ?? "PASSKEY_LOGIN_FAILED"));
        return;
      }
      goAfterLogin(router, redirectTo, data.user);
    } catch {
      setError(t("passkeyAborted"));
    } finally {
      setPasskeyLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Network className="size-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">NetMaster</h1>
        <p className="text-sm text-muted-foreground">{t("tagline")}</p>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={passkeyLoading || !!preAuthToken}
        onClick={onPasskeyLogin}
      >
        {passkeyLoading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Fingerprint className="size-4" />
        )}
        {t("loginWithPasskey")}
      </Button>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        {t("or")}
        <div className="h-px flex-1 bg-border" />
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
              placeholder={t("confirmationCodePlaceholder")}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("confirmationCodeHint")}</p>
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
                placeholder="admin@netmaster.local"
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
