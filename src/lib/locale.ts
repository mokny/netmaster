// Kein next-intl-Routing (kein /en/, /de/ in der URL) – die aktive Sprache
// steckt ausschließlich im NEXT_LOCALE-Cookie. Für eingeloggte User wird sie
// zusätzlich am User-Datensatz gespiegelt (locale), damit sie geräteüber-
// greifend folgt (siehe /api/locale und createUserSession in lib/auth.ts).

export const SUPPORTED_LOCALES = ["en", "de", "nl", "fr", "es"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "en";

export const LOCALE_COOKIE = "NEXT_LOCALE";

export const LOCALE_LABELS: Record<AppLocale, { flag: string; name: string }> = {
  en: { flag: "🇬🇧", name: "English" },
  de: { flag: "🇩🇪", name: "Deutsch" },
  nl: { flag: "🇳🇱", name: "Nederlands" },
  fr: { flag: "🇫🇷", name: "Français" },
  es: { flag: "🇪🇸", name: "Español" },
};

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

// Wählt aus einem Accept-Language-Header die beste unterstützte Sprache,
// z.B. "de-DE,de;q=0.9,en;q=0.8" -> "de".
export function resolveLocaleFromAcceptLanguage(header: string | null): AppLocale {
  if (!header) return DEFAULT_LOCALE;
  const candidates = header
    .split(",")
    .map((part) => part.split(";")[0].trim().toLowerCase())
    .map((tag) => tag.split("-")[0]);
  for (const candidate of candidates) {
    if (isAppLocale(candidate)) return candidate;
  }
  return DEFAULT_LOCALE;
}
