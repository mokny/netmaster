import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isAppLocale,
  resolveLocaleFromAcceptLanguage,
} from "@/lib/locale";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;

  let locale = isAppLocale(cookieLocale) ? cookieLocale : undefined;
  if (!locale) {
    const headerStore = await headers();
    locale = resolveLocaleFromAcceptLanguage(headerStore.get("accept-language"));
  }
  locale ??= DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
