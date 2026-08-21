import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireRole,
  requireNetworkToolsEnabled,
  handleApiError,
  ApiError,
} from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { detectFirewallBackend, applyGuarded, buildSimpleDeleteScript } from "@/lib/firewall";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
) {
  try {
    const session = await requireRole("EDITOR");
    const { id, ruleId } = await params;
    if (!/^[a-zA-Z0-9]+$/.test(ruleId)) {
      throw new ApiError(400, "INVALID_RULE_ID");
    }
    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    requireNetworkToolsEnabled(server);

    const backend = await detectFirewallBackend(server);
    if (backend === "none") {
      throw new ApiError(400, "UNSUPPORTED_FIREWALL_BACKEND");
    }

    const script = buildSimpleDeleteScript(backend, ruleId);
    const result = await applyGuarded(server, backend, script, (confirmed) => {
      void writeAuditLog(session, confirmed ? "firewall.rule.confirmed" : "firewall.rule.reverted", {
        serverId: id,
        detail: `delete [${ruleId}]`,
      });
    });

    await writeAuditLog(session, "firewall.rule.delete", { serverId: id, detail: `[${ruleId}]` });

    return NextResponse.json({
      backend: result.backend,
      rollbackTimeoutMs: result.rollbackTimeoutMs,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
