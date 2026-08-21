import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session-token";

// Bewusst nur eine optimistische JWT-Prüfung (kein DB-Zugriff auf die
// Session-Tabelle) – Proxy läuft auf jedem Request/Prefetch, DB-Checks
// gehören hier nicht hin. Die maßgebliche Prüfung inkl. Widerruf einzelner
// Sessions läuft in getSession() (lib/auth.ts), das jede Route/jeder Layout
// als Data-Access-Layer aufruft.
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/login/totp",
  "/api/auth/webauthn/login/options",
  "/api/auth/webauthn/login/verify",
  "/api/locale",
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/admin") && session.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Nach einem Shell-Reset ("netmaster reset-login") muss zuerst ein neues
  // Passwort gesetzt werden, bevor irgendetwas anderes zugänglich ist.
  const FORCE_CHANGE_EXEMPT_API = ["/api/account/password", "/api/auth/me", "/api/auth/logout"];
  if (session.mustChangePassword && pathname !== "/change-password") {
    if (pathname.startsWith("/api") && !FORCE_CHANGE_EXEMPT_API.includes(pathname)) {
      return NextResponse.json(
        { error: "PASSWORD_CHANGE_REQUIRED" },
        { status: 403 }
      );
    }
    if (!pathname.startsWith("/api")) {
      return NextResponse.redirect(new URL("/change-password", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/ws).*)",
  ],
};
