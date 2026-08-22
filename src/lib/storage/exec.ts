import { execOnServer, buildRootScriptCommand, type SshExecResult } from "@/lib/ssh";
import type { Server as ServerModel } from "@/generated/prisma/client";

export class StorageCommandError extends Error {
  constructor(public stdout: string, public stderr: string, public code: number | null) {
    super(stderr.trim() || stdout.trim() || `command exited with code ${code}`);
  }
}

// Führt ein mehrzeiliges root-Skript (bash -s, ggf. via sudo) auf dem Server
// aus und wirft bei nicht-Null-Exitcode einen StorageCommandError mit
// stdout/stderr, damit API-Routen die Rohausgabe als ApiError.detail
// durchreichen können.
export async function runRootScript(
  server: ServerModel,
  script: string,
  timeoutMs = 30_000
): Promise<SshExecResult> {
  const { command, stdin } = buildRootScriptCommand(server, script);
  const result = await execOnServer(server, command, timeoutMs, stdin);
  if (result.code !== 0) {
    throw new StorageCommandError(result.stdout, result.stderr, result.code);
  }
  return result;
}

// Wie runRootScript, gibt aber auch bei Fehler das Ergebnis zurück statt zu
// werfen - für Erkennungsskripte, bei denen ein Fehlschlag ("Tool fehlt")
// ein normales, erwartbares Ergebnis ist.
export async function tryRootScript(
  server: ServerModel,
  script: string,
  timeoutMs = 30_000
): Promise<SshExecResult> {
  const { command, stdin } = buildRootScriptCommand(server, script);
  return execOnServer(server, command, timeoutMs, stdin);
}

const DEVICE_PATH_PATTERN = /^\/dev\/[a-zA-Z0-9/_-]+$/;

// Validiert Gerätepfade, bevor sie in Shell-Skripte eingebettet werden
// (mount/mkfs/parted/mdadm/lvm nehmen Gerätepfade nicht immer quotable
// entgegen bzw. die Skripte bauen mehrzeilige Heredocs, wo shellQuote allein
// nicht reicht) - Whitelist statt Escaping.
export function assertDevicePath(path: string): string {
  if (!DEVICE_PATH_PATTERN.test(path)) {
    throw new Error(`Invalid device path: ${path}`);
  }
  return path;
}

const MOUNTPOINT_PATTERN = /^\/[a-zA-Z0-9/_.-]*$/;

export function assertMountpoint(path: string): string {
  if (!MOUNTPOINT_PATTERN.test(path) || path.includes("..")) {
    throw new Error(`Invalid mountpoint: ${path}`);
  }
  return path;
}

const NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export function assertName(name: string, what = "name"): string {
  if (!NAME_PATTERN.test(name)) {
    throw new Error(`Invalid ${what}: ${name}`);
  }
  return name;
}

// Debian/Ubuntu (apt) mit dnf/yum-Fallback für RHEL-artige Distros - deckt
// die praktisch relevanten Server-Distros ab, ohne eine Paketmanager-
// Erkennung über /etc/os-release zu benötigen.
export function installBlock(packages: string[]): string {
  const pkgList = packages.join(" ");
  return `
    if command -v apt-get >/dev/null 2>&1; then
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -qq && apt-get install -y -qq ${pkgList}
    elif command -v dnf >/dev/null 2>&1; then
      dnf install -y -q ${pkgList}
    elif command -v yum >/dev/null 2>&1; then
      yum install -y -q ${pkgList}
    fi
  `.trim();
}

// Bash-Fragment, das ein Paket nur installiert, wenn der zugehörige Befehl
// noch fehlt - vermeidet einen unnötigen apt-get/dnf-Lauf bei jedem Aufruf.
export function ensureCommand(cmd: string, packages: string[]): string {
  return `if ! command -v ${cmd} >/dev/null 2>&1; then ${installBlock(packages)}; fi`;
}
