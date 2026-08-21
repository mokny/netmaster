import { WireguardDetail } from "@/components/servers/wireguard-detail";

export default async function WireguardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WireguardDetail serverId={id} />;
}
