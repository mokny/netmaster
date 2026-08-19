import { DockerDetail } from "@/components/docker/docker-detail";

export default async function DockerDetailPage({
  params,
}: {
  params: Promise<{ serverId: string; containerId: string }>;
}) {
  const { serverId, containerId } = await params;
  return <DockerDetail serverId={serverId} containerId={containerId} />;
}
