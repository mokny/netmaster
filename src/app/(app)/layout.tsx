import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { TerminalManagerProvider } from "@/hooks/use-terminal-manager";
import { TerminalDock } from "@/components/terminal/terminal-dock";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <TerminalManagerProvider>
      <AppShell session={session}>{children}</AppShell>
      <TerminalDock />
    </TerminalManagerProvider>
  );
}
