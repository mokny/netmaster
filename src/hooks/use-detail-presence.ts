"use client";

import { useEffect } from "react";

// Signalisiert dem Server (siehe src/lib/ws/detail-presence-handler.ts), dass
// gerade eine VM-/Container-Detailseite offen ist - solange die Verbindung
// steht, pollt der Scheduler den zugehörigen Host schneller (~20s statt
// vmDockerPollIntervalSec). Schickt selbst keine Daten, die laufen weiter
// über useLiveEvents.
export function useDetailPresence(serverId: string, kind: "proxmox" | "docker") {
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(
      `${protocol}://${window.location.host}/api/ws/detail-presence?serverId=${encodeURIComponent(serverId)}&kind=${kind}`
    );
    return () => ws.close();
  }, [serverId, kind]);
}
