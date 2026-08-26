"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Loader2, FolderOpen, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fbLogin } from "./api-client";
import { FbApiError } from "./types";
import { fbErrorMessage } from "./format";

export function FilebrowserLoginForm({ serverId }: { serverId: string }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password) return;
    setBusy(true);
    setError(null);
    try {
      await fbLogin(serverId, username, password);
      router.push(`/filebrowser/${serverId}`);
      router.refresh();
    } catch (err) {
      if (err instanceof FbApiError) {
        setError(fbErrorMessage(err.code, "Anmeldung fehlgeschlagen."));
      } else {
        setError("Anmeldung fehlgeschlagen.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center p-6">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        aria-label="Design wechseln"
      >
        <Sun className="size-4 scale-100 dark:scale-0" />
        <Moon className="absolute size-4 scale-0 dark:scale-100" />
      </Button>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FolderOpen className="size-5" />
          </div>
          <CardTitle>Dateimanager</CardTitle>
          <CardDescription>Melde dich mit deinem Samba-Zugang an.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fb-username">Benutzername</Label>
              <Input
                id="fb-username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={busy}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fb-password">Passwort</Label>
              <Input
                id="fb-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || !username || !password}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Anmelden
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
