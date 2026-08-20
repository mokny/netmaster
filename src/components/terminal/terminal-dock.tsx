"use client";

import { TerminalPanel } from "@/components/terminal/terminal-panel";

// Rendert das Terminal-Panel über der App, unabhängig von der aktuellen
// Route (Provider sitzt im AppShell-Layout, bleibt beim Navigieren
// gemountet).
export function TerminalDock() {
  return <TerminalPanel />;
}
