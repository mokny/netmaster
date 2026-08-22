import type { Server as ServerModel } from "@/generated/prisma/client";
import { runRootScript, ensureCommand, assertMountpoint } from "./exec";

// Eigene, von NetMaster verwaltete Export-Datei statt /etc/exports direkt zu
// editieren - bestehende, manuell gepflegte Exports bleiben so unangetastet.
// nfs-utils lädt /etc/exports.d/*.exports automatisch mit (seit vielen
// Jahren Standard bei Debian/Ubuntu/RHEL).
const EXPORTS_FILE = "/etc/exports.d/netmaster.exports";

const NFS_SERVER_PACKAGES = ["nfs-kernel-server", "nfs-common", "rpcbind"];
const NFS_CLIENT_PACKAGES = ["nfs-common"];

function ensureNfsServer(): string {
  return `
${ensureCommand("exportfs", NFS_SERVER_PACKAGES)}
mkdir -p /etc/exports.d
touch ${EXPORTS_FILE}
systemctl enable --now rpcbind 2>/dev/null || true
systemctl enable --now nfs-kernel-server 2>/dev/null || systemctl enable --now nfs-server 2>/dev/null || true
`.trim();
}

export interface NfsExport {
  path: string;
  client: string;
  options: string;
}

function parseExportsFile(raw: string): NfsExport[] {
  const exports: NfsExport[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(\S+)\s+(\S+)\((.*)\)\s*$/);
    if (!match) continue;
    exports.push({ path: match[1], client: match[2], options: match[3] });
  }
  return exports;
}

export async function listExports(server: ServerModel): Promise<NfsExport[]> {
  const script = `
${ensureNfsServer()}
cat ${EXPORTS_FILE} 2>/dev/null || true
`.trim();
  const result = await runRootScript(server, script);
  return parseExportsFile(result.stdout);
}

const CLIENT_PATTERN = /^[a-zA-Z0-9.:/*_-]{1,64}$/;
const OPTIONS_PATTERN = /^[a-zA-Z0-9_,=.-]*$/;

export async function addExport(
  server: ServerModel,
  path: string,
  client: string,
  options: string
): Promise<void> {
  assertMountpoint(path);
  if (!CLIENT_PATTERN.test(client)) throw new Error(`Invalid client spec: ${client}`);
  const opts = options || "rw,sync,no_subtree_check";
  if (!OPTIONS_PATTERN.test(opts)) throw new Error(`Invalid export options: ${opts}`);
  const line = `${path} ${client}(${opts})`;
  const script = `
set -e
${ensureNfsServer()}
grep -vF ${JSON.stringify(line)} ${EXPORTS_FILE} > ${EXPORTS_FILE}.tmp 2>/dev/null || true
mv ${EXPORTS_FILE}.tmp ${EXPORTS_FILE}
echo ${JSON.stringify(line)} >> ${EXPORTS_FILE}
exportfs -ra
`.trim();
  await runRootScript(server, script);
}

export async function removeExport(
  server: ServerModel,
  path: string,
  client: string
): Promise<void> {
  assertMountpoint(path);
  const script = `
set -e
touch ${EXPORTS_FILE}
grep -vE "^${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} ${client.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\(" ${EXPORTS_FILE} > ${EXPORTS_FILE}.tmp || true
mv ${EXPORTS_FILE}.tmp ${EXPORTS_FILE}
exportfs -ra
`.trim();
  await runRootScript(server, script);
}

export async function getExportfsStatus(server: ServerModel): Promise<string> {
  const result = await runRootScript(server, `${ensureNfsServer()}\nexportfs -v 2>/dev/null || true`);
  return result.stdout;
}

// --- NFS-Client (Remote-Freigabe einhängen) ---------------------------------

const CLIENT_FSTAB_MARKER = "# netmaster-nfs-mount";

export interface NfsClientMount {
  remote: string; // host:/export/path
  mountpoint: string;
  options: string;
}

export async function listClientMounts(server: ServerModel): Promise<NfsClientMount[]> {
  const result = await runRootScript(
    server,
    `grep -F ${JSON.stringify(CLIENT_FSTAB_MARKER)} /etc/fstab 2>/dev/null || true`
  );
  const mounts: NfsClientMount[] = [];
  for (const line of result.stdout.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    mounts.push({ remote: parts[0], mountpoint: parts[1], options: parts[3] });
  }
  return mounts;
}

const REMOTE_PATTERN = /^[a-zA-Z0-9.:_-]+:\/[a-zA-Z0-9/_.-]*$/;

export async function addClientMount(
  server: ServerModel,
  remote: string,
  mountpoint: string,
  options: string
): Promise<void> {
  if (!REMOTE_PATTERN.test(remote)) throw new Error(`Invalid NFS remote: ${remote}`);
  assertMountpoint(mountpoint);
  const opts = options || "defaults,_netdev";
  const script = `
set -e
${ensureCommand("mount.nfs", NFS_CLIENT_PACKAGES)}
mkdir -p ${mountpoint}
sed -i "\\#${mountpoint} .*${CLIENT_FSTAB_MARKER}#d" /etc/fstab
echo "${remote} ${mountpoint} nfs ${opts} 0 0 ${CLIENT_FSTAB_MARKER}" >> /etc/fstab
mount ${mountpoint}
`.trim();
  await runRootScript(server, script, 20_000);
}

export async function removeClientMount(server: ServerModel, mountpoint: string): Promise<void> {
  assertMountpoint(mountpoint);
  const script = `
umount ${mountpoint} 2>/dev/null || true
sed -i "\\#${mountpoint} .*${CLIENT_FSTAB_MARKER}#d" /etc/fstab
`.trim();
  await runRootScript(server, script);
}
