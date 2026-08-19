export interface FileNodeDTO {
  name: string;
  path: string;
  isDirectory: boolean;
  isSymlink: boolean;
  size: number;
  mode: number;
  mtime: number;
}

export type FileManagerClientMessage =
  | { type: "list"; reqId: string; path: string }
  | { type: "mkdir"; reqId: string; path: string }
  | { type: "touch"; reqId: string; path: string }
  | { type: "delete"; reqId: string; path: string }
  | { type: "rename"; reqId: string; from: string; to: string }
  | { type: "copy"; reqId: string; from: string; to: string }
  | { type: "move"; reqId: string; from: string; to: string }
  | { type: "chmod"; reqId: string; path: string; mode: string }
  | { type: "chown"; reqId: string; path: string; uid: number; gid: number }
  | { type: "readFile"; reqId: string; path: string }
  | { type: "writeFile"; reqId: string; path: string; content: string };

export type DistributiveOmit<T, K extends string | number | symbol> = T extends unknown
  ? Omit<T, K>
  : never;

export type FileManagerServerMessage =
  | { type: "ready"; homeDir: string }
  | { type: "ok"; reqId: string }
  | { type: "list-result"; reqId: string; path: string; entries: FileNodeDTO[] }
  | { type: "read-result"; reqId: string; content: string }
  | { type: "error"; reqId?: string; code: string; message: string };
