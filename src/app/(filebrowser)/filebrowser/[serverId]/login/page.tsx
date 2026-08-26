import { FilebrowserLoginForm } from "@/components/filebrowser/login-form";

export default async function FilebrowserLoginPage({
  params,
}: {
  params: Promise<{ serverId: string }>;
}) {
  const { serverId } = await params;
  return <FilebrowserLoginForm serverId={serverId} />;
}
