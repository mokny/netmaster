import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-helpers";
import { listExports } from "@/lib/storage/nfs";

// Für das NFS-Client-Panel: liefert alle Storage-fähigen Server samt ihrer
// dort per NFS-Server-Modul konfigurierten Exports, damit beim Einhängen
// einer Freigabe aus einem anderen NetMaster-Server dessen Exports zur
// Auswahl vorgeschlagen werden können (siehe nfs-client-panel.tsx).
export async function GET() {
  try {
    await requireSession();
    const servers = await prisma.server.findMany({
      where: { storageEnabled: true },
      orderBy: { name: "asc" },
    });

    const sources = await Promise.all(
      servers.map(async (server) => {
        try {
          const exports = await listExports(server);
          return { id: server.id, name: server.name, hostname: server.hostname, exports };
        } catch {
          return { id: server.id, name: server.name, hostname: server.hostname, exports: [] };
        }
      })
    );

    return NextResponse.json({ sources });
  } catch (err) {
    return handleApiError(err);
  }
}
