"use client";

import { useEffect, useRef } from "react";

export type LiveEvent =
  | {
      type: "metric";
      serverId: string;
      sample: Record<string, unknown>;
      disks?: Record<string, unknown>[];
    }
  | { type: "server-status"; serverId: string; status: string; error?: string | null }
  | { type: "service-check"; serviceCheckId: string; serverId: string; status: string }
  | { type: "docker"; serverId: string; containers: unknown[] }
  | { type: "proxmox"; serverId: string; vms: unknown[] };

export function useLiveEvents(onEvent: (event: LiveEvent) => void) {
  const handlerRef = useRef(onEvent);

  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closedByEffect = false;

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${protocol}://${window.location.host}/api/ws`);

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as LiveEvent;
          handlerRef.current(parsed);
        } catch {
          // ignore malformed payloads
        }
      };

      ws.onclose = () => {
        if (!closedByEffect) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      closedByEffect = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);
}
