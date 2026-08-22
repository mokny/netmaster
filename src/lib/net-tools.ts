import { execFile } from "node:child_process";
import net from "node:net";
import dns from "node:dns/promises";

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

// execFile statt exec/shell - Eingaben stammen vom Nutzer und laufen nicht
// durch eine Shell (siehe ping.ts, gleiches Muster).
function runExecFile(cmd: string, args: string[], timeoutMs: number): Promise<ToolResult> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const output = (stdout || stderr || "").trim();
        if (err) {
          resolve({ success: false, output, error: err.message });
          return;
        }
        resolve({ success: true, output });
      }
    );
  });
}

export function runPing(host: string): Promise<ToolResult> {
  return runExecFile("ping", ["-c", "4", "-W", "3", host], 20_000);
}

export function runTraceroute(host: string): Promise<ToolResult> {
  return runExecFile("traceroute", ["-w", "2", "-q", "1", "-m", "20", host], 35_000);
}

export function runWhois(query: string): Promise<ToolResult> {
  return runExecFile("whois", [query], 20_000);
}

export async function runDnsLookup(host: string): Promise<ToolResult> {
  const [a, aaaa, mx, txt, ns, cname] = await Promise.allSettled([
    dns.resolve4(host),
    dns.resolve6(host),
    dns.resolveMx(host),
    dns.resolveTxt(host),
    dns.resolveNs(host),
    dns.resolveCname(host),
  ]);
  const lines: string[] = [];
  if (a.status === "fulfilled" && a.value.length) lines.push(`A: ${a.value.join(", ")}`);
  if (aaaa.status === "fulfilled" && aaaa.value.length) lines.push(`AAAA: ${aaaa.value.join(", ")}`);
  if (cname.status === "fulfilled" && cname.value.length) lines.push(`CNAME: ${cname.value.join(", ")}`);
  if (mx.status === "fulfilled" && mx.value.length) {
    lines.push(`MX: ${mx.value.map((m) => `${m.exchange} (${m.priority})`).join(", ")}`);
  }
  if (txt.status === "fulfilled" && txt.value.length) {
    lines.push(`TXT: ${txt.value.map((t) => t.join("")).join(" | ")}`);
  }
  if (ns.status === "fulfilled" && ns.value.length) lines.push(`NS: ${ns.value.join(", ")}`);

  if (lines.length === 0) {
    const firstError = [a, aaaa, mx, txt, ns, cname].find(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );
    const reason = firstError?.reason;
    return {
      success: false,
      output: "",
      error: reason instanceof Error ? reason.message : "No DNS records found",
    };
  }
  return { success: true, output: lines.join("\n") };
}

export function runPortCheck(host: string, port: number, timeoutMs = 5000): Promise<ToolResult> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const start = Date.now();
    let settled = false;
    const finish = (result: ToolResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () =>
      finish({ success: true, output: `Port ${port} on ${host} is open (${Date.now() - start}ms)` })
    );
    socket.once("timeout", () => finish({ success: false, output: "", error: "Connection timed out" }));
    socket.once("error", (err) => finish({ success: false, output: "", error: err.message }));
    socket.connect(port, host);
  });
}

export async function runHttpCheck(url: string, timeoutMs = 10_000): Promise<ToolResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal });
    const latency = Date.now() - start;
    const headerLines = Array.from(res.headers.entries())
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    return {
      success: res.ok,
      output: `HTTP ${res.status} ${res.statusText} - ${latency}ms\n\n${headerLines}`,
    };
  } catch (err) {
    return { success: false, output: "", error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
