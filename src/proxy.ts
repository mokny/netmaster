import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session-token";
import { NAS_SESSION_COOKIE, verifyNasSessionToken } from "@/lib/nas-session-token";

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

// NAS-Bereich ist eine komplett eigene, von den Webmaster-Sessions
// getrennte Welt (eigenes Cookie, eigenes Login) - siehe nas-auth.ts.
const NAS_PUBLIC_PATHS = [
  "/nas/login",
  "/api/nas/auth/login",
  "/api/nas/auth/login/totp",
];

async function nasProxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  if (NAS_PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(NAS_SESSION_COOKIE)?.value;
  const session = token ? await verifyNasSessionToken(token) : null;

  if (!session) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const loginUrl = new URL("/nas/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const FORCE_CHANGE_EXEMPT_API = [
    "/api/nas/account",
    "/api/nas/auth/me",
    "/api/nas/auth/logout",
  ];
  if (session.mustChangePassword && pathname !== "/nas/change-password") {
    if (pathname.startsWith("/api") && !FORCE_CHANGE_EXEMPT_API.includes(pathname)) {
      return NextResponse.json({ error: "PASSWORD_CHANGE_REQUIRED" }, { status: 403 });
    }
    if (!pathname.startsWith("/api")) {
      return NextResponse.redirect(new URL("/nas/change-password", req.url));
    }
  }

  return NextResponse.next();
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // Interne Gateway-APIs authentifizieren sich per Shared Secret
  // (requireInternalSecret), nicht per Session-Cookie - hier nicht anfassen.
  if (pathname === "/api/internal" || pathname.startsWith("/api/internal/")) {
    return NextResponse.next();
  }

  // Öffentliche Freigabe-Links (/nas-link, /api/nas-link) sind bewusst
  // unauthentifiziert - eigener Prüfmechanismus (Token/Passwort) direkt in
  // der Route. Wichtig: exakte Segment-Prüfung, sonst würde "/api/nas-link"
  // fälschlich vom "/api/nas"-Prefix-Check weiter unten erfasst.
  if (pathname === "/nas-link" || pathname.startsWith("/nas-link/") ||
      pathname === "/api/nas-link" || pathname.startsWith("/api/nas-link/")) {
    return NextResponse.next();
  }

  // Harte Trennung: /nas läuft komplett über die NAS-Session, nie über die
  // Webmaster-Session (und umgekehrt).
  if (pathname === "/nas" || pathname.startsWith("/nas/") ||
      pathname === "/api/nas" || pathname.startsWith("/api/nas/")) {
    return nasProxy(req);
  }

  if (PUBLIC_PATHS.includes(pathname)) {
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
