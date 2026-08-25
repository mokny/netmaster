import { redirect } from "next/navigation";
import { getNasSession } from "@/lib/nas-auth";
import { NasForcePasswordChangeForm } from "@/components/nas/nas-force-password-change-form";

export default async function NasChangePasswordPage() {
  const session = await getNasSession();
  if (!session) redirect("/nas/login");
  if (!session.mustChangePassword) redirect("/nas");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <NasForcePasswordChangeForm />
    </div>
  );
}
