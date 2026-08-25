"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, FolderLock } from "lucide-react";

export function NasPublicLinkView({
  token,
  notFound,
  requiresPassword,
  fileName,
}: {
  token: string;
  notFound: boolean;
  requiresPassword: boolean;
  fileName: string;
}) {
  const t = useTranslations("nas.publicLink");
  const [password, setPassword] = useState("");

  if (notFound) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <FolderLock className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("notFound")}</p>
      </div>
    );
  }

  const href = `/api/nas-link/${token}${password ? `?password=${encodeURIComponent(password)}` : ""}`;

  return (
    <div className="w-full max-w-sm space-y-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <FolderLock className="size-8" />
        <h1 className="text-lg font-medium">{fileName}</h1>
      </div>
      {requiresPassword && (
        <div className="space-y-2 text-left">
          <Label htmlFor="password">{t("password")}</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      )}
      <Button className="w-full" render={<a href={href} download={fileName} />}>
        <Download className="size-4" />
        {t("download")}
      </Button>
      <Alert>
        <AlertDescription>{t("hint")}</AlertDescription>
      </Alert>
    </div>
  );
}
