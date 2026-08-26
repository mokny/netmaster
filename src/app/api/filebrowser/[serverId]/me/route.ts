import { NextResponse } from "next/server";
import { requireFbContext, handleFbError } from "@/lib/filebrowser/route-helpers";
import { getSambaWebUser } from "@/lib/filebrowser/access";

// Bootstrap-Endpunkt für die Explorer-UI: liefert den eingeloggten Usernamen,
// seine erlaubten Freigaben (Top-Level-Ordner) und ob Thumbnails aktiv sind,
// oder 401, wenn keine gültige Session (mehr) besteht - die UI leitet dann
// zum Login um.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const ctx = await requireFbContext(serverId);
    const webUser = await getSambaWebUser(serverId, ctx.username);
    return NextResponse.json({
      username: ctx.username,
      thumbnailsEnabled: !!webUser?.thumbnailsEnabled,
      shares: ctx.shares.map((s) => ({ name: s.name, writable: s.writable })),
    });
  } catch (err) {
    return handleFbError(err);
  }
}
