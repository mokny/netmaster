"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

export interface TerminalSession {
  id: string;
  serverId: string;
  serverName: string;
  vmid: number | null;
  vmType: "QEMU" | "LXC" | null;
  minimized: boolean;
  offset: number;
}

interface TerminalManagerContextValue {
  sessions: TerminalSession[];
  openTerminal: (serverId: string, serverName: string) => void;
  openVmTerminal: (
    serverId: string,
    vmid: number,
    vmName: string,
    vmType: "QEMU" | "LXC"
  ) => void;
  closeTerminal: (id: string) => void;
  toggleMinimize: (id: string) => void;
}

const TerminalManagerContext = createContext<TerminalManagerContextValue | null>(null);

export function TerminalManagerProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const counter = useRef(0);

  const openTerminal = useCallback((serverId: string, serverName: string) => {
    counter.current += 1;
    const id = `term-${Date.now()}-${counter.current}`;
    setSessions((prev) => [
      ...prev,
      { id, serverId, serverName, vmid: null, vmType: null, minimized: false, offset: prev.length },
    ]);
  }, []);

  const openVmTerminal = useCallback(
    (serverId: string, vmid: number, vmName: string, vmType: "QEMU" | "LXC") => {
      counter.current += 1;
      const id = `term-${Date.now()}-${counter.current}`;
      setSessions((prev) => [
        ...prev,
        { id, serverId, serverName: vmName, vmid, vmType, minimized: false, offset: prev.length },
      ]);
    },
    []
  );

  const closeTerminal = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const toggleMinimize = useCallback((id: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, minimized: !s.minimized } : s))
    );
  }, []);

  return (
    <TerminalManagerContext.Provider
      value={{ sessions, openTerminal, openVmTerminal, closeTerminal, toggleMinimize }}
    >
      {children}
    </TerminalManagerContext.Provider>
  );
}

export function useTerminalManager() {
  const ctx = useContext(TerminalManagerContext);
  if (!ctx) {
    throw new Error("useTerminalManager muss innerhalb von TerminalManagerProvider genutzt werden");
  }
  return ctx;
}
