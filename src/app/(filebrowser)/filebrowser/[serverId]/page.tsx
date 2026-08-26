import { FilebrowserExplorer } from "@/components/filebrowser/explorer";

export default async function FilebrowserPage({
  params,
}: {
  params: Promise<{ serverId: string }>;
}) {
  const { serverId } = await params;
  return <FilebrowserExplorer serverId={serverId} />;
}
