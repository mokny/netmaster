"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { FilePanel } from "./file-panel";
import { EditorArea, type EditorTab } from "./editor-area";
import type { FileNodeDTO } from "@/lib/file-manager-types";
import type { FileManagerConnection } from "@/hooks/use-file-manager-connection";
import { useConfirm } from "@/components/ui/confirm-dialog";

// Dateimanager im MC-Stil: zwei unabhängige Panels auf demselben Ziel (Server,
// Docker-Container oder Proxmox-VM/LXC), darunter ein Editor-Bereich mit Tabs
// für geöffnete Textdateien. `wsPath` und `restBasePath` bestimmen das Ziel -
// siehe use-file-manager-connection.ts.
export function FileManagerTab({
  wsPath,
  restBasePath,
}: {
  wsPath: string;
  restBasePath: string;
}) {
  const confirm = useConfirm();
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const openFile = useCallback(
    async (connection: FileManagerConnection, node: FileNodeDTO) => {
      const existing = tabs.find((t) => t.path === node.path);
      if (existing) {
        setActiveId(existing.id);
        return;
      }
      const id = node.path;
      const draft: EditorTab = {
        id,
        path: node.path,
        name: node.name,
        connection,
        content: "",
        savedContent: "",
        loading: true,
        error: null,
        saving: false,
      };
      setTabs((prev) => [...prev, draft]);
      setActiveId(id);
      try {
        const content = await connection.readFile(node.path);
        setTabs((prev) =>
          prev.map((t) => (t.id === id ? { ...t, content, savedContent: content, loading: false } : t))
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Datei konnte nicht geladen werden";
        setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, loading: false, error: message } : t)));
        toast.error(`${node.name}: ${message}`);
      }
    },
    [tabs]
  );

  const closeTab = useCallback(
    async (id: string) => {
      const tab = tabs.find((t) => t.id === id);
      if (tab && tab.content !== tab.savedContent) {
        const ok = await confirm({
          title: "Ungespeicherte Änderungen",
          description: `"${tab.name}" hat ungespeicherte Änderungen. Trotzdem schließen?`,
          confirmText: "Schließen",
          variant: "destructive",
        });
        if (!ok) return;
      }
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== id);
        setActiveId((current) => {
          if (current !== id) return current;
          return next.length > 0 ? next[next.length - 1].id : null;
        });
        return next;
      });
    },
    [tabs, confirm]
  );

  const changeTab = useCallback((id: string, content: string) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, content } : t)));
  }, []);

  const saveTab = useCallback(
    async (id: string) => {
      const tab = tabs.find((t) => t.id === id);
      if (!tab) return;
      setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, saving: true } : t)));
      try {
        await tab.connection.writeFile(tab.path, tab.content);
        setTabs((prev) =>
          prev.map((t) => (t.id === id ? { ...t, saving: false, savedContent: t.content } : t))
        );
        toast.success(`${tab.name} gespeichert`);
      } catch (err) {
        setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, saving: false } : t)));
        toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
      }
    },
    [tabs]
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <FilePanel wsPath={wsPath} restBasePath={restBasePath} side="left" onOpenFile={openFile} />
        <FilePanel wsPath={wsPath} restBasePath={restBasePath} side="right" onOpenFile={openFile} />
      </div>
      <EditorArea
        tabs={tabs}
        activeId={activeId}
        onSelect={setActiveId}
        onClose={closeTab}
        onChange={changeTab}
        onSave={saveTab}
      />
    </div>
  );
}
