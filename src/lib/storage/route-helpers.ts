import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, requireStorageEnabled } from "@/lib/api-helpers";
import type { Role } from "@/generated/prisma/client";

// Lädt den Server für einen Storage-Endpunkt und prüft Session/Rolle sowie
// server.storageEnabled in einem Schritt - jede Storage-Route (Disks/NFS/
// Samba) braucht genau diese drei Prüfungen vor der eigentlichen Aktion.
// Kein `select` (im Gegensatz zu SERVER_SELECT-basierten Routen), da die
// SSH-Helfer (execOnServer etc.) das volle ServerModel inkl.
// encryptedSecret/-Passphrase/-SudoPassword erwarten.
export async function loadStorageServer(id: string, minRole?: Role) {
  const session = minRole ? await requireRole(minRole) : await requireSession();
  const server = await prisma.server.findUniqueOrThrow({ where: { id } });
  requireStorageEnabled(server);
  return { session, server };
}
