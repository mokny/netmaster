"use client";

import { useTerminalManager } from "@/hooks/use-terminal-manager";
import { FloatingTerminal } from "@/components/terminal/floating-terminal";

// Rendert alle offenen Terminal-Fenster über der App, unabhängig von der
// aktuellen Route (Provider sitzt im AppShell-Layout, bleibt beim Navigieren
// gemountet).
export function TerminalDock() {
  const { sessions, closeTerminal, toggleMinimize } = useTerminalManager();

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      {sessions.map((session) => (
        <FloatingTerminal
          key={session.id}
          session={session}
          onClose={() => closeTerminal(session.id)}
          onToggleMinimize={() => toggleMinimize(session.id)}
        />
      ))}
    </div>
  );
}
