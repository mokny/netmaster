import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/dashboard");

  const { from } = await searchParams;
  const redirectTo = from && from.startsWith("/") ? from : "/dashboard";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <LoginForm redirectTo={redirectTo} />
    </div>
  );
}
