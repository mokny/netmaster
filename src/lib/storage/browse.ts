import path from "node:path";
import type { Server as ServerModel } from "@/generated/prisma/client";
import { shellQuote } from "@/lib/ssh";
import { tryRootScript } from "./exec";

export interface RemoteDirEntry {
  name: string;
  path: string;
}

export interface RemoteDirListing {
  path: string;
  parentPath: string | null;
  entries: RemoteDirEntry[];
  notFound: boolean;
}

// Normalisiert einen vom Client übergebenen Pfad relativ zu "/" - kollabiert
// "." und ".." rein lexikalisch (path.posix.normalize), sodass ein Traversal
// wie "/a/../../etc" nie über die Root hinausreicht, egal was der Client
// schickt.
export function normalizeRemotePath(input: string): string {
  const withRoot = input.startsWith("/") ? input : `/${input}`;
  const normalized = path.posix.normalize(withRoot);
  return normalized;
}

// Listet Unterverzeichnisse eines Pfads auf dem Zielserver per SSH auf -
// genutzt vom Ordner-Browser bei der NAS-Freigaben-Erstellung, damit Admins
// einen bestehenden Ordner auswählen können statt den Pfad blind eintippen
// zu müssen.
export async function listRemoteDirectories(
  server: ServerModel,
  requestedPath: string
): Promise<RemoteDirListing> {
  const target = normalizeRemotePath(requestedPath);
  const script = `
target=${shellQuote(target)}
if [ ! -d "$target" ]; then
  exit 3
fi
find "$target" -mindepth 1 -maxdepth 1 -type d -printf '%f\\n' 2>/dev/null | LC_ALL=C sort
`.trim();

  const result = await tryRootScript(server, script);
  const parentPath = target === "/" ? null : path.posix.dirname(target);

  if (result.code === 3) {
    return { path: target, parentPath, entries: [], notFound: true };
  }
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "LIST_DIRECTORY_FAILED");
  }

  const entries = result.stdout
    .split("\n")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name, path: path.posix.join(target, name) }));

  return { path: target, parentPath, entries, notFound: false };
}
