import { randomBytes } from "node:crypto";
import type { RawSshCredentials } from "./ssh";

// Kurzlebige, einmalig einlösbare Tickets für Ad-hoc-SSH-Verbindungen zu
// Explore-Hosts ohne gespeicherten Server-Eintrag: die Zugangsdaten werden
// per POST einmal entgegengenommen (nie persistiert), hinter einem
// zufälligen Ticket im Prozessspeicher gehalten und beim WebSocket-Verbindungs-
// aufbau sofort entfernt - so stehen sie nie länger als nötig im Speicher und
// tauchen nicht im Klartext in der WS-URL auf.
const TICKET_TTL_MS = 30_000;

interface TicketEntry {
  creds: RawSshCredentials;
  expiresAt: number;
}

const tickets = new Map<string, TicketEntry>();

function sweepExpired() {
  const now = Date.now();
  for (const [ticket, entry] of tickets) {
    if (entry.expiresAt < now) tickets.delete(ticket);
  }
}

export function createAdhocSshTicket(creds: RawSshCredentials): string {
  sweepExpired();
  const ticket = randomBytes(24).toString("hex");
  tickets.set(ticket, { creds, expiresAt: Date.now() + TICKET_TTL_MS });
  return ticket;
}

export function consumeAdhocSshTicket(ticket: string): RawSshCredentials | null {
  const entry = tickets.get(ticket);
  tickets.delete(ticket);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.creds;
}
