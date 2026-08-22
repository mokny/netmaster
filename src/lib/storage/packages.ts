import type { Server as ServerModel } from "@/generated/prisma/client";
import { runRootScript } from "./exec";

// Installiert fehlende Pakete auf dem Zielserver (apt für Debian/Ubuntu,
// dnf/yum-Fallback für RHEL-artige Distros). Wird von den einzelnen
// Storage-Modulen (Disk/NFS/Samba) vor der ersten Nutzung eines Tools
// aufgerufen - jedes Modul kennt seine eigene Paketliste
// (siehe PACKAGES_* Konstanten in disks.ts/nfs.ts/samba.ts).
export async function ensurePackages(server: ServerModel, packages: string[]): Promise<void> {
  if (packages.length === 0) return;
  const pkgList = packages.map((p) => p.replace(/[^a-zA-Z0-9.+_-]/g, "")).join(" ");
  const script = `
set -e
if command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq ${pkgList}
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y -q ${pkgList}
elif command -v yum >/dev/null 2>&1; then
  yum install -y -q ${pkgList}
else
  echo "No supported package manager (apt-get/dnf/yum) found" >&2
  exit 1
fi
`.trim();
  await runRootScript(server, script, 120_000);
}
