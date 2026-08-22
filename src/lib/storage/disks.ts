import type { Server as ServerModel } from "@/generated/prisma/client";
import {
  runRootScript,
  assertDevicePath,
  assertMountpoint,
  assertName,
  ensureCommand,
} from "./exec";

const FSTAB_MARKER = "# netmaster-mount";

// --- Block-Device-Übersicht -------------------------------------------------

export interface BlockDeviceRaw {
  name: string;
  kname: string;
  path: string;
  type: string;
  size: number | null;
  fstype: string | null;
  mountpoint: string | null;
  uuid: string | null;
  label: string | null;
  model: string | null;
  serial: string | null;
  rota: boolean;
  ro: boolean;
  vendor: string | null;
  pkname: string | null;
  fsused: number | null;
  children?: BlockDeviceRaw[];
}

const LSBLK_COLUMNS =
  "NAME,KNAME,PATH,TYPE,SIZE,FSTYPE,MOUNTPOINT,UUID,LABEL,MODEL,SERIAL,ROTA,RO,PKNAME,VENDOR,FSUSED";

export async function listBlockDevices(server: ServerModel): Promise<BlockDeviceRaw[]> {
  const script = `lsblk -J -b -o ${LSBLK_COLUMNS} 2>/dev/null`;
  const result = await runRootScript(server, script);
  try {
    const parsed = JSON.parse(result.stdout) as { blockdevices: BlockDeviceRaw[] };
    return parsed.blockdevices ?? [];
  } catch {
    return [];
  }
}

// --- SMART -------------------------------------------------------------------

export interface SmartInfo {
  supported: boolean;
  healthy: boolean | null;
  temperatureC: number | null;
  raw: string;
}

export async function getSmartInfo(server: ServerModel, device: string): Promise<SmartInfo> {
  assertDevicePath(device);
  const script = `
    ${ensureCommand("smartctl", ["smartmontools"])}
    smartctl -j -a ${device} 2>/dev/null || true
  `.trim();
  const result = await runRootScript(server, script, 20_000);
  try {
    const data = JSON.parse(result.stdout);
    const supported = !!data?.smart_support?.available;
    const healthy = data?.smart_status?.passed ?? null;
    const temperatureC = data?.temperature?.current ?? null;
    return { supported, healthy, temperatureC, raw: result.stdout };
  } catch {
    return { supported: false, healthy: null, temperatureC: null, raw: result.stdout };
  }
}

// --- Mount / Unmount -----------------------------------------------------------

export async function mountDevice(
  server: ServerModel,
  device: string,
  mountpoint: string,
  options: string
): Promise<void> {
  assertDevicePath(device);
  assertMountpoint(mountpoint);
  const opts = options.replace(/[^a-zA-Z0-9,=._-]/g, "") || "defaults";
  const script = `
set -e
mkdir -p ${mountpoint}
UUID=$(blkid -s UUID -o value ${device} || true)
mount -o ${opts} ${device} ${mountpoint}
sed -i "\\#${mountpoint} .*${FSTAB_MARKER}#d" /etc/fstab
if [ -n "$UUID" ]; then
  echo "UUID=$UUID ${mountpoint} auto ${opts} 0 2 ${FSTAB_MARKER}" >> /etc/fstab
else
  echo "${device} ${mountpoint} auto ${opts} 0 2 ${FSTAB_MARKER}" >> /etc/fstab
fi
`.trim();
  await runRootScript(server, script);
}

export async function unmountDevice(
  server: ServerModel,
  device: string,
  mountpoint: string
): Promise<void> {
  assertDevicePath(device);
  assertMountpoint(mountpoint);
  const script = `
umount ${mountpoint}
sed -i "\\#${mountpoint} .*${FSTAB_MARKER}#d" /etc/fstab
`.trim();
  await runRootScript(server, script);
}

// --- Partitionierung -----------------------------------------------------------

export async function createPartitionTable(
  server: ServerModel,
  device: string,
  label: "gpt" | "msdos"
): Promise<void> {
  assertDevicePath(device);
  await runRootScript(server, `parted -s ${device} mklabel ${label}`);
}

export async function createPartition(
  server: ServerModel,
  device: string,
  fsHint: "ext4" | "xfs" | "btrfs" | "ntfs" | "fat32",
  startPercent: number,
  endPercent: number
): Promise<void> {
  assertDevicePath(device);
  const partedFs = fsHint === "ntfs" ? "ntfs" : fsHint === "fat32" ? "fat32" : "ext4";
  const script = `
set -e
parted -s ${device} mkpart primary ${partedFs} ${startPercent}% ${endPercent}%
partprobe ${device} 2>/dev/null || true
`.trim();
  await runRootScript(server, script);
}

export async function deletePartition(
  server: ServerModel,
  device: string,
  partitionNumber: number
): Promise<void> {
  assertDevicePath(device);
  if (!Number.isInteger(partitionNumber) || partitionNumber < 1 || partitionNumber > 128) {
    throw new Error("Invalid partition number");
  }
  const script = `
set -e
parted -s ${device} rm ${partitionNumber}
partprobe ${device} 2>/dev/null || true
`.trim();
  await runRootScript(server, script);
}

// --- Formatieren -----------------------------------------------------------

export type FormatFilesystem = "ext4" | "xfs" | "btrfs" | "ntfs" | "exfat";

const FORMAT_PACKAGES: Record<FormatFilesystem, string[]> = {
  ext4: ["e2fsprogs"],
  xfs: ["xfsprogs"],
  btrfs: ["btrfs-progs"],
  ntfs: ["ntfs-3g"],
  exfat: ["exfatprogs"],
};

function mkfsCommand(fstype: FormatFilesystem, device: string, label: string): string {
  const l = label.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16);
  switch (fstype) {
    case "ext4":
      return `mkfs.ext4 -F${l ? ` -L ${l}` : ""} ${device}`;
    case "xfs":
      return `mkfs.xfs -f${l ? ` -L ${l}` : ""} ${device}`;
    case "btrfs":
      return `mkfs.btrfs -f${l ? ` -L ${l}` : ""} ${device}`;
    case "ntfs":
      return `mkfs.ntfs -F -Q${l ? ` -L ${l}` : ""} ${device}`;
    case "exfat":
      return `mkfs.exfat${l ? ` -n ${l}` : ""} ${device}`;
  }
}

export async function formatDevice(
  server: ServerModel,
  device: string,
  fstype: FormatFilesystem,
  label = ""
): Promise<void> {
  assertDevicePath(device);
  const cmd = mkfsCommand(fstype, device, label);
  const binary = cmd.split(" ")[0];
  const script = `
set -e
${ensureCommand(binary, FORMAT_PACKAGES[fstype])}
${cmd}
`.trim();
  await runRootScript(server, script, 60_000);
}

// --- LVM -----------------------------------------------------------------------

export interface LvmReport {
  pvs: Record<string, string>[];
  vgs: Record<string, string>[];
  lvs: Record<string, string>[];
}

// lvm's `--reportformat json` shape is `{"report":[{"<key>":[...]}]}`.
async function runLvmReport(
  server: ServerModel,
  cmd: string,
  columns: string,
  key: string
): Promise<Record<string, string>[]> {
  const script = `
${ensureCommand("pvs", ["lvm2"])}
${cmd} --reportformat json -o ${columns} 2>/dev/null || true
`.trim();
  const result = await runRootScript(server, script);
  try {
    const parsed = JSON.parse(result.stdout);
    return parsed?.report?.[0]?.[key] ?? [];
  } catch {
    return [];
  }
}

export async function listLvm(server: ServerModel): Promise<LvmReport> {
  const [pvs, vgs, lvs] = await Promise.all([
    runLvmReport(server, "pvs", "pv_name,pv_size,vg_name,pv_uuid", "pv"),
    runLvmReport(server, "vgs", "vg_name,vg_size,vg_free,pv_count,lv_count", "vg"),
    runLvmReport(server, "lvs", "lv_name,vg_name,lv_size,lv_path,lv_active", "lv"),
  ]);
  return { pvs, vgs, lvs };
}

export async function createPhysicalVolume(server: ServerModel, device: string): Promise<void> {
  assertDevicePath(device);
  await runRootScript(server, `${ensureCommand("pvcreate", ["lvm2"])}\npvcreate -f ${device}`);
}

export async function createVolumeGroup(
  server: ServerModel,
  vgName: string,
  devices: string[]
): Promise<void> {
  assertName(vgName, "volume group name");
  devices.forEach(assertDevicePath);
  await runRootScript(
    server,
    `${ensureCommand("vgcreate", ["lvm2"])}\nvgcreate ${vgName} ${devices.join(" ")}`
  );
}

export async function createLogicalVolume(
  server: ServerModel,
  vgName: string,
  lvName: string,
  sizeSpec: string
): Promise<void> {
  assertName(vgName, "volume group name");
  assertName(lvName, "logical volume name");
  const size = sizeSpec.replace(/[^a-zA-Z0-9%.]/g, "");
  const sizeArg = size.endsWith("%FREE") || size.endsWith("%VG") ? `-l ${size}` : `-L ${size}`;
  await runRootScript(server, `lvcreate ${sizeArg} -n ${lvName} ${vgName}`);
}

export async function extendLogicalVolume(
  server: ServerModel,
  vgName: string,
  lvName: string,
  addSizeSpec: string,
  fstype: "ext4" | "xfs" | "btrfs"
): Promise<void> {
  assertName(vgName, "volume group name");
  assertName(lvName, "logical volume name");
  const size = addSizeSpec.replace(/[^a-zA-Z0-9%.]/g, "");
  const lvPath = `/dev/${vgName}/${lvName}`;
  const resizeCmd =
    fstype === "ext4"
      ? `resize2fs ${lvPath}`
      : fstype === "xfs"
        ? `xfs_growfs ${lvPath}`
        : `btrfs filesystem resize max $(findmnt -n -o TARGET ${lvPath})`;
  const script = `
set -e
lvextend -L +${size} ${lvPath}
${resizeCmd}
`.trim();
  await runRootScript(server, script, 60_000);
}

export async function removeLogicalVolume(server: ServerModel, vgName: string, lvName: string) {
  assertName(vgName, "volume group name");
  assertName(lvName, "logical volume name");
  await runRootScript(server, `lvremove -f /dev/${vgName}/${lvName}`);
}

export async function removeVolumeGroup(server: ServerModel, vgName: string) {
  assertName(vgName, "volume group name");
  await runRootScript(server, `vgremove -f ${vgName}`);
}

export async function removePhysicalVolume(server: ServerModel, device: string) {
  assertDevicePath(device);
  await runRootScript(server, `pvremove -f ${device}`);
}

// --- Software-RAID (mdadm) --------------------------------------------------

export async function getRaidStatus(server: ServerModel): Promise<string> {
  const script = `
${ensureCommand("mdadm", ["mdadm"])}
cat /proc/mdstat 2>/dev/null || true
`.trim();
  const result = await runRootScript(server, script);
  return result.stdout;
}

export async function getRaidDetail(server: ServerModel, mdDevice: string): Promise<string> {
  assertDevicePath(mdDevice);
  const result = await runRootScript(server, `mdadm --detail ${mdDevice} 2>/dev/null || true`);
  return result.stdout;
}

export type RaidLevel = "0" | "1" | "5" | "6" | "10";

export async function createRaidArray(
  server: ServerModel,
  mdDevice: string,
  level: RaidLevel,
  devices: string[]
): Promise<void> {
  assertDevicePath(mdDevice);
  devices.forEach(assertDevicePath);
  const script = `
set -e
${ensureCommand("mdadm", ["mdadm"])}
yes | mdadm --create ${mdDevice} --level=${level} --raid-devices=${devices.length} ${devices.join(" ")}
mkdir -p /etc/mdadm
mdadm --detail --scan >> /etc/mdadm/mdadm.conf 2>/dev/null || mdadm --detail --scan >> /etc/mdadm.conf 2>/dev/null || true
update-initramfs -u 2>/dev/null || true
`.trim();
  await runRootScript(server, script, 30_000);
}

export async function growRaidArray(
  server: ServerModel,
  mdDevice: string,
  addDevices: string[]
): Promise<void> {
  assertDevicePath(mdDevice);
  addDevices.forEach(assertDevicePath);
  const script = `
set -e
mdadm --add ${mdDevice} ${addDevices.join(" ")}
CURRENT=$(mdadm --detail ${mdDevice} | grep "Raid Devices" | awk '{print $4}')
NEW=$((CURRENT + ${addDevices.length}))
mdadm --grow ${mdDevice} --raid-devices=$NEW
`.trim();
  await runRootScript(server, script, 30_000);
}

export async function stopRaidArray(server: ServerModel, mdDevice: string): Promise<void> {
  assertDevicePath(mdDevice);
  const script = `
mdadm --stop ${mdDevice}
sed -i "\\#${mdDevice}#d" /etc/mdadm/mdadm.conf 2>/dev/null || sed -i "\\#${mdDevice}#d" /etc/mdadm.conf 2>/dev/null || true
`.trim();
  await runRootScript(server, script);
}
