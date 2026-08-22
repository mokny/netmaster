import { ServerDebugView } from "@/components/admin/server-debug-view";

export default async function AdminDebugServerPage({
  params,
}: {
  params: Promise<{ serverId: string }>;
}) {
  const { serverId } = await params;
  return <ServerDebugView serverId={serverId} />;
}
