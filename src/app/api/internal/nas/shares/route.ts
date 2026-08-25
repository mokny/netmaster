import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { requireInternalSecret } from "@/lib/nas-internal-auth";

// Vom Gateway periodisch abgefragt (Mount-Manager), um zu wissen, welche
// Freigaben aktuell aktiv gemountet sein sollen und mit welchen
// SSH-Zugangsdaten. Entschlüsselung des Zielserver-Secrets passiert
// ausschließlich hier - MASTER_SECRET bleibt im Hauptcontainer.
export async function GET(req: Request) {
  const authError = requireInternalSecret(req);
  if (authError) return authError;

  const shares = await prisma.nasShare.findMany({
    include: {
      server: true,
      members: { include: { nasUser: { select: { email: true } } } },
    },
  });

  const payload = shares.map((share) => ({
    id: share.id,
    name: share.name,
    remotePath: share.remotePath,
    mountTransport: share.mountTransport,
    quotaBytes: share.quotaBytes ? share.quotaBytes.toString() : null,
    readOnlyLocked: share.readOnlyLocked,
    members: share.members.map((m) => ({ email: m.nasUser.email, role: m.role })),
    server: {
      id: share.server.id,
      hostname: share.server.hostname,
      sshPort: share.server.sshPort,
      sshUsername: share.server.sshUsername,
      authType: share.server.authType,
      secret: decryptSecret(share.server.encryptedSecret),
      passphrase: share.server.encryptedPassphrase
        ? decryptSecret(share.server.encryptedPassphrase)
        : undefined,
    },
  }));

  return NextResponse.json({ shares: payload });
}
