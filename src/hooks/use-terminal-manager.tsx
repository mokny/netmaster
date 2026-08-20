"use client";

import { createContext, useCallback, useContext, useState } from "react";

export type TerminalKind = "server" | "vm-serial" | "vm-vnc" | "docker-exec";

export interface TerminalSession {
  id: string;
  kind: TerminalKind;
  label: string;
  serverId: string;
  vmid: number | null;
  vmType: "QEMU" | "LXC" | null;
  containerId: string | null;
}

export interface PanelGeometry {
  x: number | null;
  y: number | null;
  width: number;
  height: number;
}

const DEFAULT_GEOMETRY: PanelGeometry = { x: null, y: null, width: 720, height: 420 };
const MIN_WIDTH = 420;
const MIN_HEIGHT = 260;

interface TerminalManagerContextValue {
  sessions: TerminalSession[];
  activeId: string | null;
  minimized: boolean;
  maximized: boolean;
  geometry: PanelGeometry;
  openTerminal: (serverId: string, serverName: string) => void;
  openVmTerminal: (
    serverId: string,
    vmid: number,
    vmName: string,
    vmType: "QEMU" | "LXC"
  ) => void;
  openVmVnc: (serverId: string, vmid: number, vmName: string) => void;
  openDockerExec: (serverId: string, containerId: string, containerName: string) => void;
  closeTab: (id: string) => void;
  setActive: (id: string) => void;
  closePanel: () => void;
  toggleMinimize: () => void;
  toggleMaximize: () => void;
  setGeometry: (geometry: Partial<PanelGeometry>) => void;
}

const TerminalManagerContext = createContext<TerminalManagerContextValue | null>(null);

export function TerminalManagerProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [geometry, setGeometryState] = useState<PanelGeometry>(DEFAULT_GEOMETRY);

  const openTab = useCallback((key: string, factory: () => TerminalSession) => {
    setSessions((prev) => {
      const existing = prev.find((s) => s.id === key);
      if (existing) {
        setActiveId(existing.id);
        return prev;
      }
      const session = factory();
      setActiveId(session.id);
      return [...prev, session];
    });
    setMinimized(false);
  }, []);

  const openTerminal = useCallback(
    (serverId: string, serverName: string) => {
      const key = `server:${serverId}`;
      openTab(key, () => ({
        id: key,
        kind: "server",
        label: serverName,
        serverId,
        vmid: null,
        vmType: null,
        containerId: null,
      }));
    },
    [openTab]
  );

  const openVmTerminal = useCallback(
    (serverId: string, vmid: number, vmName: string, vmType: "QEMU" | "LXC") => {
      const key = `vm-serial:${serverId}:${vmid}`;
      openTab(key, () => ({
        id: key,
        kind: "vm-serial",
        label: vmName,
        serverId,
        vmid,
        vmType,
        containerId: null,
      }));
    },
    [openTab]
  );

  const openVmVnc = useCallback(
    (serverId: string, vmid: number, vmName: string) => {
      const key = `vm-vnc:${serverId}:${vmid}`;
      openTab(key, () => ({
        id: key,
        kind: "vm-vnc",
        label: vmName,
        serverId,
        vmid,
        vmType: "QEMU",
        containerId: null,
      }));
    },
    [openTab]
  );

  const openDockerExec = useCallback(
    (serverId: string, containerId: string, containerName: string) => {
      const key = `docker-exec:${serverId}:${containerId}`;
      openTab(key, () => ({
        id: key,
        kind: "docker-exec",
        label: containerName,
        serverId,
        vmid: null,
        vmType: null,
        containerId,
      }));
    },
    [openTab]
  );

  const closeTab = useCallback((id: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      setActiveId((current) => {
        if (current !== id) return current;
        return next.length > 0 ? next[next.length - 1].id : null;
      });
      return next;
    });
  }, []);

  const setActive = useCallback((id: string) => {
    setActiveId(id);
    setMinimized(false);
  }, []);

  const closePanel = useCallback(() => {
    setSessions([]);
    setActiveId(null);
  }, []);

  const toggleMinimize = useCallback(() => {
    setMinimized((m) => !m);
  }, []);

  const toggleMaximize = useCallback(() => {
    setMaximized((m) => !m);
    setMinimized(false);
  }, []);

  const setGeometry = useCallback((patch: Partial<PanelGeometry>) => {
    setGeometryState((prev) => ({
      x: patch.x !== undefined ? patch.x : prev.x,
      y: patch.y !== undefined ? patch.y : prev.y,
      width: patch.width !== undefined ? Math.max(MIN_WIDTH, patch.width) : prev.width,
      height: patch.height !== undefined ? Math.max(MIN_HEIGHT, patch.height) : prev.height,
    }));
  }, []);

  return (
    <TerminalManagerContext.Provider
      value={{
        sessions,
        activeId,
        minimized,
        maximized,
        geometry,
        openTerminal,
        openVmTerminal,
        openVmVnc,
        openDockerExec,
        closeTab,
        setActive,
        closePanel,
        toggleMinimize,
        toggleMaximize,
        setGeometry,
      }}
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
