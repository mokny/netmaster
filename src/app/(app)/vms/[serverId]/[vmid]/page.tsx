import { VmDetail } from "@/components/vms/vm-detail";

export default async function VmDetailPage({
  params,
}: {
  params: Promise<{ serverId: string; vmid: string }>;
}) {
  const { serverId, vmid } = await params;
  return <VmDetail serverId={serverId} vmid={Number(vmid)} />;
}
