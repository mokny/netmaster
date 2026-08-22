import { StorageDetail } from "@/components/servers/storage/storage-detail";

export default async function StorageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StorageDetail serverId={id} />;
}
