import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ForcePasswordChangeForm } from "@/components/force-password-change-form";

export default async function ChangePasswordPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.mustChangePassword) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <ForcePasswordChangeForm />
    </div>
  );
}
