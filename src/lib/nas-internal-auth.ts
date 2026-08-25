import { NextResponse } from "next/server";

// Schützt die internen NAS-APIs (Haupt-App <-> Gateway-Container). Beide
// Richtungen laufen ausschließlich über localhost (network_mode: host,
// gleiches Muster wie Caddy -> netmaster), abgesichert per Shared Secret
// statt Session-Cookie, da hier kein Browser beteiligt ist.
export function requireInternalSecret(req: Request): NextResponse | null {
  const expected = process.env.NAS_INTERNAL_SECRET;
  if (!expected) {
    console.error("NAS_INTERNAL_SECRET ist nicht gesetzt - interne NAS-API deaktiviert.");
    return NextResponse.json({ error: "NAS_GATEWAY_NOT_CONFIGURED" }, { status: 503 });
  }
  const provided = req.headers.get("x-internal-secret");
  if (provided !== expected) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  return null;
}
