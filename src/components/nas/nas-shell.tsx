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
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/nas" className="flex items-center gap-2 font-semibold">
            <FolderLock className="size-5" />
            {t("title")}
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
                  {t(`nav.${item.labelKey}`)}
                </Button>
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-sm text-muted-foreground sm:inline">{nasUser.name}</span>
          <LanguageSwitcher />
          <Button variant="ghost" size="icon" onClick={logout} aria-label={t("logout")}>
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4">{children}</main>
    </div>
  );
}
