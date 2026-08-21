"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ManageSnippetsDialog } from "@/components/servers/manage-snippets-dialog";
import { useTerminalManager } from "@/hooks/use-terminal-manager";
import { Play, Settings2, SquareTerminal } from "lucide-react";
import type { SnippetDTO } from "@/lib/types";

export function SnippetsMenu({
  serverId,
  serverName,
  size = "sm",
}: {
  serverId: string;
  serverName: string;
  size?: "sm" | "icon";
}) {
  const t = useTranslations("servers.snippets");
  const { runSnippet } = useTerminalManager();
  const [snippets, setSnippets] = useState<SnippetDTO[] | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  function load() {
    fetch(`/api/snippets?serverId=${encodeURIComponent(serverId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setSnippets(data.snippets))
      .catch(() => {});
  }

  useEffect(load, [serverId]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size={size} title="Snippets" onClick={load}>
              <SquareTerminal className="size-4" />
              {size !== "icon" && "Snippets"}
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {snippets === null ? (
            <DropdownMenuItem disabled>{t("loading")}</DropdownMenuItem>
          ) : snippets.length === 0 ? (
            <DropdownMenuItem disabled>{t("noSnippetsYet")}</DropdownMenuItem>
          ) : (
            snippets.map((s) => (
              <DropdownMenuItem
                key={s.id}
                onClick={() => runSnippet(serverId, serverName, s.commands)}
              >
                <Play className="size-4" />
                {s.name}
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setManageOpen(true)}>
            <Settings2 className="size-4" />
            {t("manage")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ManageSnippetsDialog
        serverId={serverId}
        open={manageOpen}
        onOpenChange={setManageOpen}
        onChanged={load}
      />
    </>
  );
}
