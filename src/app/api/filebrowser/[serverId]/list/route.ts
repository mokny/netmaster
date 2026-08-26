import { NextResponse } from "next/server";
import { openSftpSessionAs } from "@/lib/ssh";
import { listDir } from "@/lib/sftp-ops";
import { requireFbContext, handleFbError } from "@/lib/filebrowser/route-helpers";
import { resolveVirtualPath } from "@/lib/filebrowser/access";
import { joinVirtual, toFbEntry, type FbEntry } from "@/lib/filebrowser/entries";
import { TRASH_DIR_NAME } from "@/lib/filebrowser/trash";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const { serverId } = await params;
    const ctx = await requireFbContext(serverId);
    const url = new URL(req.url);
    const virtualPath = url.searchParams.get("path") || "/";

    // Wurzelverzeichnis: die Freigaben selbst sind die Top-Level-"Ordner",
    // kein echtes SFTP-Verzeichnis dahinter.
    if (virtualPath === "/" || virtualPath === "") {
      const entries: FbEntry[] = ctx.shares
        .map((s) => ({
          name: s.name,
          path: `/${s.name}`,
          isDirectory: true,
          size: 0,
          mtime: 0,
          extension: null,
          writable: s.writable,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return NextResponse.json({ path: "/", entries });
    }

    const resolved = resolveVirtualPath(ctx.shares, virtualPath);
    const { conn, sftp } = await openSftpSessionAs(ctx.server, ctx.username, ctx.password);
    try {
      const nodes = await listDir(sftp, resolved.absPath);
      // .trash ist ein Implementierungsdetail (nur über die eigene
      // Papierkorb-Ansicht erreichbar), kein normaler Ordner - unabhängig
      // vom Hidden-Files-Toggle im Client immer aus der Auflistung filtern.
      const entries = nodes
        .filter((n) => n.name !== TRASH_DIR_NAME)
        .map((n) => toFbEntry(n, joinVirtual(virtualPath, n.name), resolved.share.writable));
      return NextResponse.json({ path: virtualPath, entries });
    } finally {
      conn.end();
    }
  } catch (err) {
    return handleFbError(err);
  }
}
