"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  Server,
  Users,
  Network,
  Sun,
  Moon,
  LogOut,
  Boxes,
  Container,
  UserCog,
  Waypoints,
  ActivitySquare,
  Router,
  Radar,
  ChevronsLeft,
  ChevronsRight,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { WakeLockManager } from "@/components/wake-lock-manager";
import type { SessionPayload } from "@/lib/auth";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, minRole: "VIEWER" },
  { href: "/servers", label: "Server", icon: Server, minRole: "VIEWER" },
  { href: "/vms", label: "VMs", icon: Boxes, minRole: "VIEWER" },
  { href: "/docker", label: "Docker", icon: Container, minRole: "VIEWER" },
  { href: "/network", label: "Netzwerk", icon: Waypoints, minRole: "VIEWER" },
  { href: "/upchecker", label: "Upchecker", icon: ActivitySquare, minRole: "VIEWER" },
  { href: "/explore", label: "Explore", icon: Radar, minRole: "VIEWER" },
  { href: "/router", label: "Router", icon: Router, minRole: "ADMIN" },
  { href: "/admin/users", label: "Nutzer", icon: Users, minRole: "ADMIN" },
] as const;

const roleRank: Record<string, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };

export function AppShell({
  session,
  children,
  defaultCollapsed = false,
}: {
  session: SessionPayload;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [version, setVersion] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => roleRank[session.role] >= roleRank[item.minRole]
  );

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `sidebar_collapsed=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  useEffect(() => {
    fetch("/api/version")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setVersion(data?.version ?? null))
      .catch(() => {});
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const initials = session.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen w-full">
      <WakeLockManager />
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Network className="size-4" />
          </div>
          {!collapsed && <span className="font-semibold">NetMaster</span>}
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {visibleNavItems.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const link = (
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  collapsed && "justify-center",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className="size-4" />
                {!collapsed && item.label}
              </Link>
            );
            if (!collapsed) return <div key={item.href}>{link}</div>;
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger render={link} />
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="icon"
            className="w-full"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Navigation ausklappen" : "Navigation einklappen"}
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          </Button>
        </div>
        <div className="border-t p-3 text-xs text-muted-foreground">
          {!collapsed && "Angemeldet als"}
          <div className={cn("mt-1 flex items-center gap-2", collapsed && "justify-center")}>
            <Badge variant="secondary">{session.role}</Badge>
          </div>
          {version && (
            <div
              className={cn(
                "mt-2 text-[11px] text-muted-foreground/70",
                collapsed && "text-center"
              )}
            >
              v{version}
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background px-4">
          <div className="flex items-center gap-1 md:hidden">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger
                render={
                  <Button variant="ghost" size="icon" aria-label="Menü öffnen">
                    <Menu className="size-5" />
                  </Button>
                }
              />
              <SheetContent side="left" className="w-3/4 max-w-xs p-0">
                <SheetHeader className="border-b">
                  <SheetTitle className="flex items-center gap-2">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      <Network className="size-4" />
                    </div>
                    NetMaster
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex-1 space-y-1 p-3">
                  {visibleNavItems.map((item) => {
                    const active =
                      pathname === item.href || pathname.startsWith(item.href + "/");
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileNavOpen(false)}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        )}
                      >
                        <item.icon className="size-4" />
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
                <div className="space-y-1 border-t p-3">
                  <Link
                    href="/account"
                    onClick={() => setMobileNavOpen(false)}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <UserCog className="size-4" />
                    Konto
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileNavOpen(false);
                      logout();
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-destructive transition-colors hover:bg-accent"
                  >
                    <LogOut className="size-4" />
                    Abmelden
                  </button>
                  {version && (
                    <div className="px-3 pt-1 text-[11px] text-muted-foreground/70">
                      v{version}
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
            <Network className="size-5" />
            <span className="font-semibold">NetMaster</span>
          </div>
          <div className="hidden md:block" />
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Theme wechseln"
            >
              <Sun className="size-4 scale-100 dark:scale-0" />
              <Moon className="absolute size-4 scale-0 dark:scale-100" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" className="gap-2 px-2">
                    <Avatar className="size-7">
                      <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    <span className="hidden text-sm sm:inline">{session.name}</span>
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    {session.name}
                    <div className="text-xs font-normal text-muted-foreground">
                      {session.email}
                    </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/account")}>
                  <UserCog className="size-4" />
                  Konto
                </DropdownMenuItem>
                <DropdownMenuItem onClick={logout} variant="destructive">
                  <LogOut className="size-4" />
                  Abmelden
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
