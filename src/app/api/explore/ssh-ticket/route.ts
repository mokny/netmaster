import { NextResponse } from "next/server";
import { requireRole, handleApiError, ApiError } from "@/lib/api-helpers";
import { createAdhocSshTicket } from "@/lib/adhoc-ssh-tickets";

// Nimmt einmalig SSH-Zugangsdaten für einen nicht als Server angelegten
// Explore-Host entgegen und gibt ein kurzlebiges Ticket zurück, mit dem der
// interne Terminal-Client (adhoc-terminal-handler.ts) sich verbindet. Die
// Zugangsdaten werden nirgends persistiert.
export async function POST(req: Request) {
  try {
    await requireRole("EDITOR");
    const body = await req.json();

    const host = String(body.host ?? "").trim();
    const port = Number(body.port ?? 22);
    const username = String(body.username ?? "").trim();
    const authType = body.authType === "PRIVATE_KEY" ? "PRIVATE_KEY" : "PASSWORD";
    const secret = String(body.secret ?? "");
    const passphrase = body.passphrase ? String(body.passphrase) : undefined;

    if (!host || !username || !secret) {
      throw new ApiError(400, "Host, Benutzername und Passwort/Key sind erforderlich");
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ApiError(400, "Ungültiger Port");
    }

    const ticket = createAdhocSshTicket({ host, port, username, authType, secret, passphrase });
    return NextResponse.json({ ticket });
  } catch (err) {
    return handleApiError(err);
  }
}
