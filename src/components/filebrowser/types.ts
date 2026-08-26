export interface FbEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  mtime: number;
  extension: string | null;
  writable: boolean;
}

export interface FbShareInfo {
  name: string;
  writable: boolean;
}

export interface TrashItem {
  share: string;
  entryName: string;
  originalRelPath: string;
  deletedAt: number;
  isDirectory: boolean;
  size: number;
}

export type ConflictMode = "overwrite" | "rename";

export type SortKey = "name" | "size" | "mtime" | "type";
export type SortDir = "asc" | "desc";

export interface FbSessionInfo {
  id: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
}

export class FbApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public detail?: string
  ) {
    super(code);
  }
}
