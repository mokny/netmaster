import { redirect } from "next/navigation";
import { cookies } from "next/headers";
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

  const cookieStore = await cookies();
  const defaultCollapsed = cookieStore.get("sidebar_collapsed")?.value === "1";

  return (
    <TerminalManagerProvider>
      <AppShell session={session} defaultCollapsed={defaultCollapsed}>
        {children}
      </AppShell>
      <TerminalDock />
    </TerminalManagerProvider>
  );
}
