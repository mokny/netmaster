"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { FilePanel } from "./file-panel";
import { EditorArea, type EditorTab } from "./editor-area";
import type { FileNodeDTO } from "@/lib/file-manager-types";
import type { FileManagerConnection } from "@/hooks/use-file-manager-connection";

// Dateimanager im MC-Stil: zwei unabhängige Panels auf demselben Server,
// darunter ein Editor-Bereich mit Tabs für geöffnete Textdateien.
export function FileManagerTab({ serverId }: { serverId: string }) {
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

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const tab = prev.find((t) => t.id === id);
      if (tab && tab.content !== tab.savedContent) {
        if (!window.confirm(`"${tab.name}" hat ungespeicherte Änderungen. Trotzdem schließen?`)) {
          return prev;
        }
      }
      const next = prev.filter((t) => t.id !== id);
      setActiveId((current) => {
        if (current !== id) return current;
        return next.length > 0 ? next[next.length - 1].id : null;
      });
      return next;
    });
  }, []);

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
        <FilePanel serverId={serverId} side="left" onOpenFile={openFile} />
        <FilePanel serverId={serverId} side="right" onOpenFile={openFile} />
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
