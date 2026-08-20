export interface ServerDTO {
  id: string;
  name: string;
  hostname: string;
  sshPort: number;
  sshUsername: string;
  authType: "PASSWORD" | "PRIVATE_KEY";
  pollIntervalSec: number;
  retentionDays: number;
  dockerEnabled: boolean;
  proxmoxEnabled: boolean;
  networkToolsEnabled: boolean;
  cpuWarn: number;
  cpuCrit: number;
  memWarn: number;
  memCrit: number;
  diskWarn: number;
  diskCrit: number;
  description: string;
  tags: string;
  lastStatus: "UNKNOWN" | "OK" | "WARNING" | "CRITICAL";
  lastError: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  cpuCores: number | null;
  memTotalMb: number | null;
  osName: string | null;
  kernelVersion: string | null;
  bootedAt: string | null;
}

export interface MetricSampleDTO {
  id: string;
  timestamp: string;
  cpuPercent: number | null;
  memPercent: number | null;
  diskPercent: number | null;
  loadAvg1: number | null;
  loadAvg5: number | null;
  loadAvg15: number | null;
  netRxBytes: number | null;
  netTxBytes: number | null;
}

export interface DiskSampleDTO {
  timestamp: string;
  mountpoint: string;
  device: string;
  totalKb: number | null;
  usedKb: number | null;
  percent: number | null;
}

export interface DiskInfoDTO {
  mountpoint: string;
  device: string;
  totalKb: number | null;
  percent: number | null;
}

export interface PushSubscriptionDTO {
  id: string;
  endpoint: string;
  userAgent: string;
  createdAt: string;
}

export interface NotificationPreferenceDTO {
  serverId: string;
  serverName: string;
  offlineEnabled: boolean;
  warningEnabled: boolean;
  criticalEnabled: boolean;
  dockerStoppedEnabled: boolean;
}

export interface ServiceCheckDTO {
  id: string;
  serverId: string;
  name: string;
  url: string;
  expectedStatus: number;
  intervalSec: number;
  timeoutMs: number;
  lastStatus: "UNKNOWN" | "OK" | "WARNING" | "CRITICAL";
  lastLatencyMs: number | null;
  lastCheckedAt: string | null;
  lastError: string | null;
}

export interface ContainerSnapshotDTO {
  id: string;
  containerId: string;
  name: string;
  image: string;
  state: string;
  cpuPercent: number | null;
  memUsageMb: number | null;
  netRxMb: number | null;
  netTxMb: number | null;
}

export interface ContainerWithServerDTO extends ContainerSnapshotDTO {
  serverId: string;
  serverName: string;
  timestamp: string;
}

export interface DockerImageDTO {
  id: string;
  imageId: string;
  repository: string;
  tag: string;
  sizeMb: number | null;
  createdLabel: string;
}

export interface ProxmoxVmDTO {
  id: string;
  serverId: string;
  vmid: number;
  type: "QEMU" | "LXC";
  name: string;
  status: string;
  cpuPercent: number | null;
  memUsedMb: number | null;
  memTotalMb: number | null;
  diskUsedGb: number | null;
  diskTotalGb: number | null;
  sample?: ProxmoxVmSampleDTO;
}

export interface ProxmoxVmWithServerDTO extends ProxmoxVmDTO {
  serverName: string;
}

export interface ProxmoxVmSampleDTO {
  timestamp: string;
  cpuPercent: number | null;
  memPercent: number | null;
  diskPercent: number | null;
}

export interface ProxmoxSnapshotDTO {
  name: string;
  description: string;
  timestamp: number | null;
  parent: string | null;
  hasVmstate: boolean;
}

export interface ProxmoxBackupDTO {
  volid: string;
  storage: string;
  sizeBytes: number | null;
  timestamp: number | null;
  notes: string;
  vmType: "qemu" | "lxc" | null;
}

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "EDITOR" | "VIEWER";
  createdAt: string;
}

export interface SessionDTO {
  id: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
}

export interface PasskeyDTO {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}
