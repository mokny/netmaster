import type { WidgetSpec } from "@/components/dashboard/add-widget-dialog";

export interface NameLookups {
  servers: Map<string, string>;
  vms: Map<string, string>; // key: `${serverId}:${vmid}`
  containers: Map<string, string>; // key: `${serverId}:${containerId}`
}

const METRIC_LABELS: Record<string, string> = {
  cpuPercent: "CPU",
  memPercent: "RAM",
  diskPercent: "Disk",
};

const UNKNOWN = "Unbekannt";

// Leitet den Widget-Titel live aus den aktuellen Server-/VM-/Container-Namen
// ab, statt den beim Erstellen gespeicherten Titel zu verwenden – so bleiben
// Titel nach einer Umbenennung der referenzierten Entität konsistent.
export function resolveWidgetTitle(spec: WidgetSpec, lookups: NameLookups): string {
  const serverName = (id: string) => lookups.servers.get(id) ?? UNKNOWN;
  const vmName = (serverId: string, vmid: number) =>
    lookups.vms.get(`${serverId}:${vmid}`) ?? UNKNOWN;
  const containerName = (serverId: string, containerId: string) =>
    lookups.containers.get(`${serverId}:${containerId}`) ?? UNKNOWN;

  switch (spec.type) {
    case "overview":
      return "Übersicht";
    case "proxmox-global":
      return "Proxmox-Übersicht";
    case "docker-global":
      return "Docker-Übersicht";
    case "server-metric":
      return `${serverName(spec.serverId)} – ${METRIC_LABELS[spec.metric] ?? spec.metric}`;
    case "server-combined-compact":
      return `${serverName(spec.serverId)} – CPU/RAM/Disk`;
    case "server-combined-chart":
      return `${serverName(spec.serverId)} – CPU/RAM/Disk (Verlauf)`;
    case "proxmox-host":
      return `${serverName(spec.serverId)} – Proxmox`;
    case "docker-host":
      return `${serverName(spec.serverId)} – Docker`;
    case "vm-combined-compact":
      return `${vmName(spec.serverId, spec.vmid)} – CPU/RAM/Disk`;
    case "vm-combined-chart":
      return `${vmName(spec.serverId, spec.vmid)} – CPU/RAM/Disk (Verlauf)`;
    case "docker-container-compact":
      return `${containerName(spec.serverId, spec.containerId)} – Docker`;
    case "docker-container-chart":
      return `${containerName(spec.serverId, spec.containerId)} – Docker (Verlauf)`;
    default:
      return UNKNOWN;
  }
}
