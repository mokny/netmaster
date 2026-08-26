import { prisma } from "@/lib/prisma";

// Bewusst in einer EIGENEN Datei ohne next/headers-Import: server.ts läuft
// über `tsx` außerhalb von Next.js' eigener Bundling-Pipeline, und ein
// Top-Level-Import von next/headers (wie in session.ts, wegen cookies())
// dort löst "Invariant: AsyncLocalStorage accessed in runtime where it is
// not available" aus - next/headers darf nur aus Route Handlers/Server
// Components importiert werden, nicht aus server.ts. sweepFbSessions
// braucht cookies() ohnehin nicht (reine DB-Hygiene), gehört also hier hin
// statt in session.ts.
const FB_SESSION_MAX_IDLE_MS = 365 * 24 * 60 * 60 * 1000;
const REVOKED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export async function sweepFbSessions(): Promise<void> {
  const now = Date.now();
  await prisma.fbSession.deleteMany({
    where: { revokedAt: { not: null, lt: new Date(now - REVOKED_RETENTION_MS) } },
  });
  await prisma.fbSession.deleteMany({
    where: { lastSeenAt: { lt: new Date(now - FB_SESSION_MAX_IDLE_MS) } },
  });
}
