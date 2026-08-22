import { NextResponse } from "next/server";
import { requireRole, handleApiError, ApiError } from "@/lib/api-helpers";
import {
  runPing,
  runTraceroute,
  runWhois,
  runDnsLookup,
  runPortCheck,
  runHttpCheck,
  type ToolResult,
} from "@/lib/net-tools";

const TOOLS = ["ping", "traceroute", "whois", "dns", "port", "http"] as const;
type Tool = (typeof TOOLS)[number];

function requireHost(value: unknown): string {
  const host = String(value ?? "").trim();
  if (!host) throw new ApiError(400, "HOST_REQUIRED");
  return host;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tool: string }> }
) {
  try {
    await requireRole("EDITOR");
    const { tool } = await params;
    if (!TOOLS.includes(tool as Tool)) throw new ApiError(400, "INVALID_TOOL");
    const body = await req.json();

    let result: ToolResult;
    switch (tool as Tool) {
      case "ping":
        result = await runPing(requireHost(body.host));
        break;
      case "traceroute":
        result = await runTraceroute(requireHost(body.host));
        break;
      case "whois":
        result = await runWhois(requireHost(body.host));
        break;
      case "dns":
        result = await runDnsLookup(requireHost(body.host));
        break;
      case "port": {
        const host = requireHost(body.host);
        const port = Number(body.port);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          throw new ApiError(400, "INVALID_PORT");
        }
        result = await runPortCheck(host, port);
        break;
      }
      case "http": {
        const url = String(body.url ?? "").trim();
        if (!/^https?:\/\//i.test(url)) throw new ApiError(400, "INVALID_URL");
        result = await runHttpCheck(url);
        break;
      }
    }

    return NextResponse.json({ result });
  } catch (err) {
    return handleApiError(err);
  }
}
