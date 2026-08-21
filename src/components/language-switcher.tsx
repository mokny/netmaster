"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCALE_LABELS, SUPPORTED_LOCALES, type AppLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

// Setzt die Sprache über /api/locale (Cookie + optional User-Account, siehe
// dort) und lädt anschließend neu, damit alle Server Components mit den
// neuen Messages rendern. Funktioniert sowohl eingeloggt (app-shell) als
// auch auf der öffentlichen Login-Seite.
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingLocale, setPendingLocale] = useState<AppLocale | null>(null);

  function selectLocale(next: AppLocale) {
    if (next === locale || isPending) return;
    setPendingLocale(next);
    startTransition(async () => {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      router.refresh();
    });
  }

  const active = LOCALE_LABELS[locale];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className={cn("gap-1.5 px-2 text-xs", className)}
            aria-label="Change language"
          >
            <span aria-hidden="true">{active.flag}</span>
            <span className="hidden sm:inline">{active.name}</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {SUPPORTED_LOCALES.map((code) => (
          <DropdownMenuItem
            key={code}
            onClick={() => selectLocale(code)}
            className={cn(code === locale && "font-semibold")}
          >
            <span aria-hidden="true">{LOCALE_LABELS[code].flag}</span>
            {LOCALE_LABELS[code].name}
            {pendingLocale === code && isPending && (
              <span className="ml-auto text-xs text-muted-foreground">…</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
