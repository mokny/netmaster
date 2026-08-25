import { redirect } from "next/navigation";
import { getNasSession } from "@/lib/nas-auth";
import { NasShell } from "@/components/nas/nas-shell";

export default async function NasShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getNasSession();
  if (!session) redirect("/nas/login");
  if (session.mustChangePassword) redirect("/nas/change-password");

  return <NasShell nasUser={session}>{children}</NasShell>;
}
