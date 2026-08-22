import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, handleApiError } from "@/lib/api-helpers";
import { listExports } from "@/lib/storage/nfs";
import { listShares, isSambaInstalled } from "@/lib/storage/samba";

// Live-Übersicht über alle NFS-Exports und Samba-Freigaben aller Server mit
// aktivierter Storage-Verwaltung - fragt bei jedem Aufruf per SSH ab, hält
// nichts in der DB vor (siehe src/lib/storage/*.ts). Nicht erreichbare
// Server liefern einen Fehler statt die gesamte Anfrage scheitern zu lassen.
export async function GET() {
  try {
    await requireRole("EDITOR");
    const servers = await prisma.server.findMany({
      where: { storageEnabled: true },
      orderBy: { name: "asc" },
    });

    const results = await Promise.all(
      servers.map(async (server) => {
        const [nfsResult, sambaResult, installedResult] = await Promise.allSettled([
          listExports(server),
          listShares(server),
          isSambaInstalled(server),
        ]);

        return {
          id: server.id,
          name: server.name,
          hostname: server.hostname,
          nfsExports: nfsResult.status === "fulfilled" ? nfsResult.value : [],
          nfsError: nfsResult.status === "rejected" ? String(nfsResult.reason) : null,
          sambaShares: sambaResult.status === "fulfilled" ? sambaResult.value : [],
          sambaError: sambaResult.status === "rejected" ? String(sambaResult.reason) : null,
          sambaInstalled: installedResult.status === "fulfilled" ? installedResult.value : false,
        };
      })
    );

    return NextResponse.json({ servers: results });
  } catch (err) {
    return handleApiError(err);
  }
}
