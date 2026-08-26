import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPasswordAuth } from "@/lib/ssh";
import { createFbSession, setFbSessionCookie } from "@/lib/filebrowser/session";
import { getLockRemainingMs, recordLoginFailure, recordLoginSuccess } from "@/lib/filebrowser/rate-limit";

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// Login des Web-Dateimanagers: verifiziert das Passwort LIVE per SSH gegen
// den Zielserver (kein gespeicherter Passwort-Hash in dieser DB) und prüft
// danach, ob der Admin für genau diesen User den Web-Zugriff freigeschaltet
// hat (SambaWebUser.webUiEnabled). serverId kommt aus der URL.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;
  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || !password) {
    return NextResponse.json({ error: "USERNAME_PASSWORD_REQUIRED" }, { status: 400 });
  }

  const ip = clientIp(req);
  const lockedMs = getLockRemainingMs(ip, serverId, username);
  if (lockedMs > 0) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfterSeconds: Math.ceil(lockedMs / 1000) },
      { status: 429 }
    );
  }

  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) {
    return NextResponse.json({ error: "SERVER_NOT_FOUND" }, { status: 404 });
  }

  const authOk = await verifyPasswordAuth({
    host: server.hostname,
    port: server.sshPort,
    username,
    authType: "PASSWORD",
    secret: password,
  });
  if (!authOk) {
    recordLoginFailure(ip, serverId, username);
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  const webUser = await prisma.sambaWebUser.findUnique({
    where: { serverId_username: { serverId, username } },
  });
  if (!webUser?.webUiEnabled) {
    // Kein Fehlversuch-Zähler hier - das Passwort war korrekt, nur das
    // Feature ist (noch) nicht freigeschaltet.
    return NextResponse.json({ error: "FILEBROWSER_DISABLED" }, { status: 403 });
  }

  recordLoginSuccess(ip, serverId, username);
  const sessionId = await createFbSession(serverId, username, password);
  await setFbSessionCookie(sessionId);

  return NextResponse.json({ ok: true, username });
}
