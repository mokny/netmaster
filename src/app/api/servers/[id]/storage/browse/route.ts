import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-helpers";
import { loadStorageServer } from "@/lib/storage/route-helpers";
import { listRemoteDirectories } from "@/lib/storage/browse";

// Listet Unterverzeichnisse eines Pfads auf dem Server auf - Grundlage für
// den Ordner-Browser bei der Erstellung von NAS-Freigaben (nur Admins, da
// hier beliebige Server-Pfade sichtbar werden).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { server } = await loadStorageServer(id, "ADMIN");
    const { searchParams } = new URL(req.url);
    const listing = await listRemoteDirectories(server, searchParams.get("path") ?? "/");
    return NextResponse.json(listing);
  } catch (err) {
    return handleApiError(err);
  }
}
