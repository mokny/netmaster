import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { handleApiError, ApiError } from "@/lib/api-helpers";
import { LOCALE_COOKIE, isAppLocale } from "@/lib/locale";

// Setzt die UI-Sprache: Cookie immer (auch ohne Login, z.B. Login-Seite),
// zusätzlich am User-Datensatz gespiegelt, falls eingeloggt, damit sie
// geräteübergreifend folgt (siehe src/lib/locale.ts).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const locale = body?.locale;
    if (!isAppLocale(locale)) {
      throw new ApiError(400, "INVALID_LOCALE");
    }

    const session = await getSession();
    if (session) {
      await prisma.user.update({ where: { id: session.userId }, data: { locale } });
    }

    const res = NextResponse.json({ locale });
    res.cookies.set(LOCALE_COOKIE, locale, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  } catch (err) {
    return handleApiError(err);
  }
}
