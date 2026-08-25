export interface ServerDTO {
  id: string;
  name: string;
  hostname: string;
  sshPort: number;
  sshUsername: string;
  authType: "PASSWORD" | "PRIVATE_KEY";
  pollIntervalSec: number;
  vmDockerPollIntervalSec: number;
  retentionDays: number;
  dockerEnabled: boolean;
  proxmoxEnabled: boolean;
  networkToolsEnabled: boolean;
  wireguardEnabled: boolean;
  storageEnabled: boolean;
  cpuWarn: number;
  cpuCrit: number;
  memWarn: number;
  memCrit: number;
  diskWarn: number;
  diskCrit: number;
  netUploadWarn: number;
  netUploadCrit: number;
  netDownloadWarn: number;
  netDownloadCrit: number;
  description: string;
  tags: string;
  lastStatus: "UNKNOWN" | "OK" | "WARNING" | "CRITICAL";
  lastError: string | null;
  lastCheckedAt: string | null;
  lastCpuStatus: "UNKNOWN" | "OK" | "WARNING" | "CRITICAL";
  lastMemStatus: "UNKNOWN" | "OK" | "WARNING" | "CRITICAL";
  lastDiskStatus: "UNKNOWN" | "OK" | "WARNING" | "CRITICAL";
  lastNetStatus: "UNKNOWN" | "OK" | "WARNING" | "CRITICAL";
  createdAt: string;
  updatedAt?: string;
  cpuCores: number | null;
  memTotalMb: number | null;
  osName: string | null;
  kernelVersion: string | null;
  bootedAt: string | null;
  // Nur von GET /api/servers/[id] befüllt (nicht in der Listen-Route) —
  // ob privilegierte Befehle (Reboot/Shutdown/Cleanup) ausführbar sind.
  hasRootAccess?: boolean;
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
  offlineDelayMin: number;
  offlineRecoveryEnabled: boolean;
  dockerStoppedEnabled: boolean;
  dockerStoppedDelayMin: number;
  dockerStoppedRecoveryEnabled: boolean;
  cpuWarnEnabled: boolean;
  cpuWarnDelayMin: number;
  cpuWarnRecoveryEnabled: boolean;
  cpuCritEnabled: boolean;
  cpuCritDelayMin: number;
  cpuCritRecoveryEnabled: boolean;
  memWarnEnabled: boolean;
  memWarnDelayMin: number;
  memWarnRecoveryEnabled: boolean;
  memCritEnabled: boolean;
  memCritDelayMin: number;
  memCritRecoveryEnabled: boolean;
  diskWarnEnabled: boolean;
  diskWarnDelayMin: number;
  diskWarnRecoveryEnabled: boolean;
  diskCritEnabled: boolean;
  diskCritDelayMin: number;
  diskCritRecoveryEnabled: boolean;
  netWarnEnabled: boolean;
  netWarnDelayMin: number;
  netWarnRecoveryEnabled: boolean;
  netCritEnabled: boolean;
  netCritDelayMin: number;
  netCritRecoveryEnabled: boolean;
}

export interface ServiceCheckDTO {
  id: string;
  serverId: string | null;
  serverName?: string | null;
  name: string;
  url: string;
  checkType: "HTTP" | "PING";
  expectedStatus: number;
  intervalSec: number;
  timeoutMs: number;
  latencyWarnMs: number | null;
  lastStatus: "UNKNOWN" | "OK" | "WARNING" | "CRITICAL";
  lastLatencyMs: number | null;
  lastCheckedAt: string | null;
  lastError: string | null;
}

export interface ServiceCheckSubscriberDTO {
  downEnabled: boolean;
  downDelayMin: number;
  downRecoveryEnabled: boolean;
  slowEnabled: boolean;
  slowDelayMin: number;
  slowRecoveryEnabled: boolean;
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
  ips: string[];
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
  ips: string[];
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

export interface NasUserDTO {
  id: string;
  email: string;
  name: string;
  canCreatePublicLinks: boolean;
  mustChangePassword: boolean;
  totpEnabled: boolean;
  createdAt: string;
  quotaBytes: string | null;
  // Summe usedBytes aller Freigaben, bei denen dieser User das einzige
  // Mitglied ist - siehe Schema-Kommentar an NasUser.quotaBytes.
  privateUsedBytes: string;
}

export interface NasGatewaySettingsDTO {
  publicHost: string;
  ftpEnabled: boolean;
  ftpPort: number;
  ftpsEnabled: boolean;
  ftpsPort: number;
  sftpPort: number;
}

export interface NasShareMemberDTO {
  nasUserId: string;
  role: "READ_ONLY" | "READ_WRITE";
  nasUser: { id: string; email: string; name: string };
}

export interface NasShareDTO {
  id: string;
  name: string;
  serverId: string;
  server: { id: string; name: string; hostname: string };
  remotePath: string;
  mountTransport: "SSHFS" | "NFS";
  quotaBytes: string | null;
  usedBytes: string;
  readOnlyLocked: boolean;
  mountActive: boolean;
  mountError: string | null;
  members: NasShareMemberDTO[];
}

export interface PasskeyDTO {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface RouterHostEntry {
  name: string;
  ip: string;
  mac: string;
  active: boolean;
  interfaceType: string;
}

export interface RouterWifiNetwork {
  index: number;
  ssid: string;
  enabled: boolean;
}

export interface RouterDeviceDTO {
  id: string;
  name: string;
  type: "FRITZBOX" | "REPEATER";
  hostname: string;
  port: number;
  useTls: boolean;
  username: string;
  pollIntervalSec: number;
  lastStatus: "UNKNOWN" | "OK" | "WARNING" | "CRITICAL";
  lastError: string | null;
  lastCheckedAt: string | null;
  modelName: string | null;
  firmwareVersion: string | null;
  uptimeSec: number | null;
  wanConnectionStatus: string | null;
  wanExternalIp: string | null;
  connectedHostsJson: string;
  wifiNetworksJson: string;
  createdAt: string;
}

export interface SnippetDTO {
  id: string;
  serverId: string | null;
  name: string;
  commands: string[];
  createdAt: string;
}

export interface RouterSampleDTO {
  id: string;
  timestamp: string;
  bytesReceived: number | null;
  bytesSent: number | null;
  connectedDevices: number | null;
}
