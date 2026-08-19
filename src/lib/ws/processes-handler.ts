import type { WebSocket } from "ws";
import { prisma } from "@/lib/prisma";
import { execOnServer, PROCESS_LIST_COMMAND } from "@/lib/ssh";
import { parseProcessListOutput } from "@/lib/monitor/processes";

const POLL_INTERVAL_MS = 2500;

// Live-Prozessliste über WebSocket, solange der Client verbunden ist (kein
// Hintergrund-Polling im Scheduler nötig).
export async function handleProcessesSocket(ws: WebSocket, serverId: string) {
  const send = (obj: Record<string, unknown>) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };

  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) {
    send({ type: "error", message: "Server nicht gefunden" });
    ws.close();
    return;
  }

  let stopped = false;
  let inFlight = false;

  async function poll() {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const current = await prisma.server.findUnique({ where: { id: serverId } });
      if (!current) return;
      const result = await execOnServer(current, PROCESS_LIST_COMMAND, 8_000);
      const processes = parseProcessListOutput(result.stdout);
      send({ type: "processes", processes });
    } catch (err) {
      send({
        type: "error",
        message: err instanceof Error ? err.message : "Abfrage fehlgeschlagen",
      });
    } finally {
      inFlight = false;
    }
  }

  void poll();
  const timer = setInterval(poll, POLL_INTERVAL_MS);

  ws.on("close", () => {
    stopped = true;
    clearInterval(timer);
  });
  ws.on("error", () => {
    stopped = true;
    clearInterval(timer);
  });
}
