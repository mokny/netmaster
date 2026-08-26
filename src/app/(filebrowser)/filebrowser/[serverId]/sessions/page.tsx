import { FilebrowserSessionsView } from "@/components/filebrowser/sessions-view";

export default async function FilebrowserSessionsPage({
  params,
}: {
  params: Promise<{ serverId: string }>;
}) {
  const { serverId } = await params;
  return <FilebrowserSessionsView serverId={serverId} />;
}
