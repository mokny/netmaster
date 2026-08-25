import { redirect } from "next/navigation";
import { getNasSession } from "@/lib/nas-auth";
import { NasLoginForm } from "@/components/nas/nas-login-form";

export default async function NasLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const session = await getNasSession();
  if (session) redirect("/nas");

  const { from } = await searchParams;
  const redirectTo = from && from.startsWith("/nas") ? from : "/nas";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <NasLoginForm redirectTo={redirectTo} />
    </div>
  );
}
