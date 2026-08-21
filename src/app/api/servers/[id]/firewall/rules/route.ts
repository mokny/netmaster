import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireRole,
  requireNetworkToolsEnabled,
  handleApiError,
  ApiError,
} from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import {
  detectFirewallBackend,
  applyGuarded,
  buildSimpleAddScript,
  type SimpleRuleInput,
} from "@/lib/firewall";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { id } = await params;
    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    requireNetworkToolsEnabled(server);

    const body = await req.json();
    const action = body.action === "deny" ? "deny" : "allow";
    const protocol = body.protocol === "udp" ? "udp" : "tcp";
    const port = Number(body.port);
    const source = typeof body.source === "string" && body.source.trim() ? body.source.trim() : null;
    const input: SimpleRuleInput = { action, protocol, port, source };

    const backend = await detectFirewallBackend(server);
    if (backend === "none") {
      throw new ApiError(400, "UNSUPPORTED_FIREWALL_BACKEND");
    }

    const ruleId = randomBytes(4).toString("hex");
    const script = buildSimpleAddScript(backend, ruleId, input);

    const detail = `${action} ${protocol}/${port}${source ? ` von ${source}` : ""} (${backend})`;
    const result = await applyGuarded(server, backend, script, (confirmed) => {
      void writeAuditLog(session, confirmed ? "firewall.rule.confirmed" : "firewall.rule.reverted", {
        serverId: id,
        detail: `${detail} [${ruleId}]`,
      });
    });

    await writeAuditLog(session, "firewall.rule.add", { serverId: id, detail: `${detail} [${ruleId}]` });

    return NextResponse.json({
      ruleId,
      backend: result.backend,
      rollbackTimeoutMs: result.rollbackTimeoutMs,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
