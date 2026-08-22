"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Copy } from "lucide-react";

const PASSWORD_CHARSET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+";

export function generateSecurePassword(length = 20): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSWORD_CHARSET[b % PASSWORD_CHARSET.length]).join("");
}

export function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const tCommon = useTranslations("common");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(tCommon("copied"));
    } catch {
      // clipboard unavailable - user can still select the field manually
    }
  }
  return (
    <div className="flex gap-1">
      <Input className="font-mono" value={value} onChange={(e) => onChange(e.target.value)} />
      <Button type="button" variant="outline" size="icon" onClick={() => onChange(generateSecurePassword())}>
        <RefreshCw className="size-4" />
      </Button>
      <Button type="button" variant="outline" size="icon" onClick={copy}>
        <Copy className="size-4" />
      </Button>
    </div>
  );
}
