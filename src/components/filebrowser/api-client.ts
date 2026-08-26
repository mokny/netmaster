import { FbApiError, type ConflictMode, type FbEntry, type FbShareInfo, type FbSessionInfo, type TrashItem } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new FbApiError(res.status, data.error ?? "ERROR", data.detail);
  }
  return data as T;
}

export function fbBase(serverId: string): string {
  return `/api/filebrowser/${serverId}`;
}

export async function fbLogin(serverId: string, username: string, password: string) {
  return request<{ ok: true; username: string }>(`${fbBase(serverId)}/login`, {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function fbLogout(serverId: string) {
  return request<{ ok: true }>(`${fbBase(serverId)}/logout`, { method: "POST" });
}

export async function fbMe(serverId: string) {
  return request<{ username: string; thumbnailsEnabled: boolean; shares: FbShareInfo[] }>(
    `${fbBase(serverId)}/me`
  );
}

export async function fbList(serverId: string, path: string) {
  return request<{ path: string; entries: FbEntry[] }>(
    `${fbBase(serverId)}/list?path=${encodeURIComponent(path)}`
  );
}

export async function fbMkdir(serverId: string, path: string) {
  return request<{ ok: true }>(`${fbBase(serverId)}/mkdir`, {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

export async function fbRename(
  serverId: string,
  path: string,
  newName: string,
  conflict?: ConflictMode
) {
  return request<{ ok: true; path: string }>(`${fbBase(serverId)}/rename`, {
    method: "POST",
    body: JSON.stringify({ path, newName, conflict }),
  });
}

export async function fbMove(serverId: string, from: string, to: string, conflict?: ConflictMode) {
  return request<{ ok: true }>(`${fbBase(serverId)}/move`, {
    method: "POST",
    body: JSON.stringify({ from, to, conflict }),
  });
}

export async function fbCopy(serverId: string, from: string, to: string, conflict?: ConflictMode) {
  return request<{ ok: true }>(`${fbBase(serverId)}/copy`, {
    method: "POST",
    body: JSON.stringify({ from, to, conflict }),
  });
}

export async function fbDelete(serverId: string, paths: string[]) {
  return request<{ ok: true; count: number }>(`${fbBase(serverId)}/delete`, {
    method: "POST",
    body: JSON.stringify({ paths }),
  });
}

export async function fbUpload(
  serverId: string,
  targetPath: string,
  files: { file: File; relPath: string }[],
  conflict?: ConflictMode
) {
  const form = new FormData();
  form.set("targetPath", targetPath);
  if (conflict) form.set("conflict", conflict);
  for (const { file, relPath } of files) {
    form.append("files", file);
    form.append("relPaths", relPath);
  }
  const res = await fetch(`${fbBase(serverId)}/upload`, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new FbApiError(res.status, data.error ?? "ERROR", data.detail);
  return data as { ok: true; uploaded: number };
}

// Lädt genau EINE Datei hoch (die bestehende Route akzeptiert weiterhin
// einen Batch, wird hierfür einfach mit einem 1-Element-Batch aufgerufen -
// vermeidet eine serverseitige zweite Route). Über XMLHttpRequest statt
// fetch(), weil nur xhr.upload.onprogress echten Fortschritt je Datei
// liefert (fetch hat dafür keine API) - Grundlage für das
// Upload-Fortschritts-Panel.
export function fbUploadFile(
  serverId: string,
  targetPath: string,
  file: File,
  relPath: string,
  conflict: ConflictMode | undefined,
  onProgress: (fraction: number) => void
): Promise<{ ok: true; uploaded: number }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.set("targetPath", targetPath);
    if (conflict) form.set("conflict", conflict);
    form.append("files", file);
    form.append("relPaths", relPath);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${fbBase(serverId)}/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // ignore
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve(data as { ok: true; uploaded: number });
      } else {
        reject(new FbApiError(xhr.status, (data.error as string) ?? "ERROR", data.detail as string | undefined));
      }
    };
    xhr.onerror = () => reject(new FbApiError(0, "NETWORK_ERROR"));
    xhr.send(form);
  });
}

export function fbDownloadUrl(serverId: string, path: string, inline = false): string {
  const q = new URLSearchParams({ path });
  if (inline) q.set("disposition", "inline");
  return `${fbBase(serverId)}/download?${q.toString()}`;
}

export function fbZipUrl(serverId: string, paths: string[]): string {
  const q = new URLSearchParams();
  for (const p of paths) q.append("path", p);
  return `${fbBase(serverId)}/zip?${q.toString()}`;
}

export function fbThumbnailUrl(serverId: string, path: string): string {
  return `${fbBase(serverId)}/thumbnail?path=${encodeURIComponent(path)}`;
}

export async function fbTrashList(serverId: string) {
  return request<{ items: TrashItem[] }>(`${fbBase(serverId)}/trash`);
}

export async function fbTrashRestore(
  serverId: string,
  share: string,
  entryName: string,
  conflict?: ConflictMode
) {
  return request<{ ok: true; path: string }>(`${fbBase(serverId)}/trash/restore`, {
    method: "POST",
    body: JSON.stringify({ share, entryName, conflict }),
  });
}

export async function fbTrashEmpty(serverId: string, share?: string) {
  return request<{ ok: true; removed: number }>(`${fbBase(serverId)}/trash/empty`, {
    method: "POST",
    body: JSON.stringify({ share }),
  });
}

export async function fbZipCreate(serverId: string, paths: string[], name: string, conflict?: ConflictMode) {
  return request<{ ok: true; path: string }>(`${fbBase(serverId)}/zip-create`, {
    method: "POST",
    body: JSON.stringify({ paths, name, conflict }),
  });
}

export async function fbUnzip(serverId: string, path: string) {
  return request<{ ok: true; extracted: number }>(`${fbBase(serverId)}/unzip`, {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

export async function fbSessions(serverId: string) {
  return request<{ sessions: FbSessionInfo[] }>(`${fbBase(serverId)}/sessions`);
}

export async function fbRevokeSession(serverId: string, sessionId: string) {
  return request<{ ok: true }>(`${fbBase(serverId)}/sessions/${sessionId}`, { method: "DELETE" });
}

export async function fbRevokeOtherSessions(serverId: string) {
  return request<{ ok: true; revoked: number }>(`${fbBase(serverId)}/sessions`, { method: "DELETE" });
}
