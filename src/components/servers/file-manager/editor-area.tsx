"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import CodeMirror from "@uiw/react-codemirror";
import { languages } from "@codemirror/language-data";
import type { LanguageSupport } from "@codemirror/language";
import { X, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FileManagerConnection } from "@/hooks/use-file-manager-connection";

export interface EditorTab {
  id: string;
  path: string;
  name: string;
  connection: FileManagerConnection;
  content: string;
  savedContent: string;
  loading: boolean;
  error: string | null;
  saving: boolean;
}

export function EditorArea({
  tabs,
  activeId,
  onSelect,
  onClose,
  onChange,
  onSave,
}: {
  tabs: EditorTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onChange: (id: string, content: string) => void;
  onSave: (id: string) => void;
}) {
  const active = tabs.find((t) => t.id === activeId) ?? null;
  const { resolvedTheme } = useTheme();
  const [langExt, setLangExt] = useState<LanguageSupport | null>(null);
  const [langExtForId, setLangExtForId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!active) return;
    const desc = languages.find((l) => l.extensions.some((ext) => active.name.endsWith(`.${ext}`)));
    if (!desc) return;
    desc.load().then((support) => {
      if (!cancelled) {
        setLangExt(support);
        setLangExtForId(active.id);
      }
    });
    return () => {
      cancelled = true;
    };
    // Bewusst nur auf id/name statt auf `active` selbst: `active` referenziert
    // ein neues Objekt bei jedem Tastenanschlag im Editor (Content ändert
    // sich), das Highlighting soll aber nur beim Tab- bzw. Dateiwechsel neu
    // geladen werden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.name]);

  // Bis das Highlighting für den aktiven Tab geladen ist (oder falls keine
  // passende Sprache existiert), keine veraltete Extension eines anderen Tabs
  // anzeigen.
  const activeLangExt = active && langExtForId === active.id ? langExt : null;

  if (tabs.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        Keine Datei geöffnet. Doppelklick auf eine Textdatei zum Bearbeiten.
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border">
      <div className="flex items-center gap-1 overflow-x-auto border-b bg-muted/40 px-1 py-1">
        {tabs.map((tab) => {
          const dirty = tab.content !== tab.savedContent;
          return (
            <button
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              className={cn(
                "group flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs",
                tab.id === activeId
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground hover:bg-background/60"
              )}
            >
              <span className="max-w-40 truncate" title={tab.path}>
                {tab.name}
              </span>
              {dirty && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
                className="rounded-sm p-0.5 opacity-0 group-hover:opacity-100 hover:bg-muted"
              >
                <X className="size-3" />
              </span>
            </button>
          );
        })}
      </div>

      {active && (
        <div className="flex flex-col">
          <div className="flex items-center justify-between border-b bg-muted/20 px-3 py-1.5">
            <span className="truncate text-xs text-muted-foreground">{active.path}</span>
            <Button
              size="xs"
              disabled={active.saving || active.content === active.savedContent}
              onClick={() => onSave(active.id)}
            >
              {active.saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              Speichern
            </Button>
          </div>
          <div className="max-h-[420px] overflow-auto">
            {active.loading ? (
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" /> Lädt…
              </div>
            ) : active.error ? (
              <div className="p-4 text-sm text-destructive">{active.error}</div>
            ) : (
              <CodeMirror
                value={active.content}
                height="420px"
                theme={resolvedTheme === "dark" ? "dark" : "light"}
                extensions={activeLangExt ? [activeLangExt] : []}
                onChange={(value) => onChange(active.id, value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                    e.preventDefault();
                    onSave(active.id);
                  }
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
