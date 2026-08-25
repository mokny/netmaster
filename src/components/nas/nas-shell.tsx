"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FolderLock, LayoutDashboard, UserCog, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { NasSessionPayload } from "@/lib/nas-auth";

const NAV_ITEMS = [
  { href: "/nas", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/nas/account", labelKey: "account", icon: UserCog },
] as const;

export function NasShell({
  nasUser,
  children,
}: {
  nasUser: NasSessionPayload;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("nas.shell");

  async function logout() {
    await fetch("/api/nas/auth/logout", { method: "POST" });
    router.push("/nas/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-3 sm:px-4">
        <div className="flex items-center gap-3 sm:gap-6">
          <Link href="/nas" className="flex shrink-0 items-center gap-2 font-semibold">
            <FolderLock className="size-5" />
            <span className="hidden sm:inline">{t("title")}</span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={pathname === item.href ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-1.5"
                >
                  <item.icon className="size-4" />
                  <span className="hidden sm:inline">{t(`nav.${item.labelKey}`)}</span>
                </Button>
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <span className="hidden text-sm text-muted-foreground md:inline">{nasUser.name}</span>
          <LanguageSwitcher />
          <Button variant="ghost" size="icon" onClick={logout} aria-label={t("logout")}>
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-3 sm:p-4">{children}</main>
    </div>
  );
}
