import { FilebrowserTrashView } from "@/components/filebrowser/trash-view";

export default async function FilebrowserTrashPage({
  params,
}: {
  params: Promise<{ serverId: string }>;
}) {
  const { serverId } = await params;
  return <FilebrowserTrashView serverId={serverId} />;
}
