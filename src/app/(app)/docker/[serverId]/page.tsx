import { ServerDockerManager } from "@/components/docker/server-docker-manager";

export default async function ServerDockerPage({
  params,
}: {
  params: Promise<{ serverId: string }>;
}) {
  const { serverId } = await params;
  return <ServerDockerManager serverId={serverId} />;
}
