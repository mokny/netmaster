import path from "node:path";
import type { FileNode } from "@/lib/sftp-ops";

export interface FbEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  mtime: number;
  extension: string | null;
  writable: boolean;
}

export function joinVirtual(dirVirtualPath: string, name: string): string {
  const normalized = dirVirtualPath.endsWith("/") ? dirVirtualPath : `${dirVirtualPath}/`;
  return `${normalized}${name}`;
}

export function toFbEntry(node: FileNode, virtualPath: string, writable: boolean): FbEntry {
  return {
    name: node.name,
    path: virtualPath,
    isDirectory: node.isDirectory,
    size: node.size,
    mtime: node.mtime,
    extension: node.isDirectory ? null : path.extname(node.name).slice(1).toLowerCase() || null,
    writable,
  };
}
