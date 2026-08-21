import { randomBytes } from "crypto";
import { execOnServer, buildRootScriptCommand, shellQuote } from "./ssh";
import type { Server as ServerModel } from "@/generated/prisma/client";

export type FirewallBackend = "nft" | "iptables" | "ufw" | "none";

// Alle app-verwalteten Regeln bekommen einen Kommentar/Marker
// "netmaster:<id>", damit sie im Simple-Modus zuverlässig wiedergefunden
// und gezielt gelöscht werden können, ohne bestehende (fremde) Regeln
// anzufassen.
const MARKER_PREFIX = "netmaster:";

export interface SimpleFirewallRule {
  id: string;
  action: "allow" | "deny";
  protocol: "tcp" | "udp";
  port: number;
  source: string | null; // CIDR/IP, null = überall
}

// Ermittelt, welches Firewall-Backend aktiv genutzt werden soll: ufw nur
// wenn installiert UND aktiv (sonst würden rohe nft/iptables-Regeln von
// ufw beim nächsten reload überschrieben), sonst nftables, sonst iptables.
export const DETECT_BACKEND_COMMAND = `
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "^Status: active"; then
  echo ufw
elif command -v nft >/dev/null 2>&1 && nft list ruleset >/dev/null 2>&1; then
  echo nft
elif command -v iptables >/dev/null 2>&1; then
  echo iptables
else
  echo none
fi
`.trim();

export function parseBackend(stdout: string): FirewallBackend {
  const v = stdout.trim();
  if (v === "ufw" || v === "nft" || v === "iptables") return v;
  return "none";
}

function snapshotCommand(backend: FirewallBackend): string {
  switch (backend) {
    case "nft":
      return "nft list ruleset 2>/dev/null";
    case "iptables":
      return "iptables-save 2>/dev/null";
    case "ufw":
      return "tar -C / -cf - etc/ufw/user.rules etc/ufw/user6.rules 2>/dev/null | base64 -w0";
    default:
      throw new Error("No supported firewall backend detected");
  }
}

function restoreCommand(backend: FirewallBackend, snapPath: string): string {
  switch (backend) {
    case "nft":
      return `nft flush ruleset 2>/dev/null; nft -f "${snapPath}" 2>/dev/null`;
    case "iptables":
      return `iptables-restore < "${snapPath}" 2>/dev/null`;
    case "ufw":
      return `base64 -d < "${snapPath}" | tar -C / -xf - 2>/dev/null; ufw reload 2>/dev/null`;
    default:
      throw new Error("No supported firewall backend detected");
  }
}

function listCommand(backend: FirewallBackend): string {
  switch (backend) {
    case "nft":
      return "nft list ruleset 2>/dev/null";
    case "iptables":
      return "iptables -S 2>/dev/null";
    case "ufw":
      return "ufw status verbose 2>/dev/null";
    default:
      return "true";
  }
}

export async function detectFirewallBackend(
  server: ServerModel
): Promise<FirewallBackend> {
  const res = await execOnServer(server, DETECT_BACKEND_COMMAND, 15_000);
  return parseBackend(res.stdout);
}

export interface RawFirewallState {
  backend: FirewallBackend;
  raw: string;
  managedRules: SimpleFirewallRule[];
}

export async function getFirewallState(
  server: ServerModel
): Promise<RawFirewallState> {
  const backend = await detectFirewallBackend(server);
  if (backend === "none") {
    return { backend, raw: "", managedRules: [] };
  }
  const res = await execOnServer(server, listCommand(backend), 15_000);
  return { backend, raw: res.stdout, managedRules: parseManagedRules(backend, res.stdout) };
}

function parseManagedRules(
  backend: FirewallBackend,
  raw: string
): SimpleFirewallRule[] {
  const rules: SimpleFirewallRule[] = [];
  for (const line of raw.split("\n")) {
    const markerIdx = line.indexOf(MARKER_PREFIX);
    if (markerIdx === -1) continue;
    const idMatch = line.slice(markerIdx).match(/netmaster:([a-zA-Z0-9]+)/);
    if (!idMatch) continue;
    const id = idMatch[1];
    const action: "allow" | "deny" = /\b(DROP|REJECT|deny)\b/.test(line)
      ? "deny"
      : "allow";
    const protocol: "tcp" | "udp" = /udp/i.test(line) ? "udp" : "tcp";
    const portMatch = line.match(/dport[= ]+(\d+)|port[= ]+(\d+)|:(\d{2,5})\b/i);
    const port = portMatch
      ? Number(portMatch[1] ?? portMatch[2] ?? portMatch[3])
      : 0;
    const sourceMatch = line.match(
      backend === "nft"
        ? /ip saddr (\S+)/
        : backend === "iptables"
          ? /-s (\S+)/
          : /from (\S+)/
    );
    rules.push({
      id,
      action,
      protocol,
      port,
      source: sourceMatch ? sourceMatch[1] : null,
    });
  }
  return rules;
}

export interface SimpleRuleInput {
  action: "allow" | "deny";
  protocol: "tcp" | "udp";
  port: number;
  source?: string | null;
}

const CIDR_PATTERN = /^[a-fA-F0-9.:]+(\/\d{1,3})?$/;

function validateSimpleRule(input: SimpleRuleInput) {
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new Error("Invalid port (1-65535)");
  }
  if (input.source && !CIDR_PATTERN.test(input.source)) {
    throw new Error("Invalid source address (IP or CIDR expected)");
  }
}

function buildAddRuleScript(
  backend: FirewallBackend,
  id: string,
  input: SimpleRuleInput
): string {
  validateSimpleRule(input);
  const marker = `${MARKER_PREFIX}${id}`;
  const src = input.source?.trim() || null;

  if (backend === "nft") {
    const verdict = input.action === "allow" ? "accept" : "drop";
    const srcExpr = src ? `ip saddr ${src} ` : "";
    return [
      "nft add table inet netmaster 2>/dev/null",
      "nft 'add chain inet netmaster input { type filter hook input priority -1 ; }' 2>/dev/null",
      `nft add rule inet netmaster input ${input.protocol} dport ${input.port} ${srcExpr}${verdict} comment "${marker}"`,
    ].join("\n");
  }
  if (backend === "iptables") {
    const verdict = input.action === "allow" ? "ACCEPT" : "DROP";
    const srcArg = src ? `-s ${shellQuote(src)} ` : "";
    return `iptables -I INPUT 1 -p ${input.protocol} --dport ${input.port} ${srcArg}-m comment --comment ${shellQuote(marker)} -j ${verdict}`;
  }
  if (backend === "ufw") {
    const verb = input.action === "allow" ? "allow" : "deny";
    const fromArg = src ? `from ${shellQuote(src)} to any ` : "";
    return `ufw ${verb} ${fromArg}port ${input.port} proto ${input.protocol} comment ${shellQuote(marker)}`;
  }
  throw new Error("No supported firewall backend detected");
}

function buildDeleteRuleScript(backend: FirewallBackend, id: string): string {
  const marker = `${MARKER_PREFIX}${id}`;
  if (backend === "nft") {
    return `
handle=$(nft -a list chain inet netmaster input 2>/dev/null | grep "${marker}" | grep -oE 'handle [0-9]+' | awk '{print $2}')
if [ -n "$handle" ]; then
  nft delete rule inet netmaster input handle "$handle"
fi
`.trim();
  }
  if (backend === "iptables") {
    return `
line=$(iptables -S INPUT 2>/dev/null | grep "${marker}")
if [ -n "$line" ]; then
  eval "iptables -D INPUT \${line#-A INPUT }"
fi
`.trim();
  }
  if (backend === "ufw") {
    return `
num=$(ufw status numbered 2>/dev/null | grep "${marker}" | grep -oE '^\\[ *[0-9]+\\]' | grep -oE '[0-9]+')
if [ -n "$num" ]; then
  yes | ufw delete "$num"
fi
`.trim();
  }
  throw new Error("No supported firewall backend detected");
}

export interface GuardedApplyResult {
  stdout: string;
  stderr: string;
  code: number | null;
  backend: FirewallBackend;
  token: string;
  rollbackTimeoutMs: number;
}

const ROLLBACK_TIMEOUT_MS = 30_000;
// Erster Confirm-Versuch nach 8s (genug Zeit, damit die Regel sicher aktiv
// ist), zweiter Versuch als Fallback bei 20s – beide deutlich vor dem
// harten 30s-Revert auf dem Server.
const CONFIRM_ATTEMPTS_MS = [8_000, 20_000];

function genToken(): string {
  return randomBytes(6).toString("hex");
}

// Führt `applyScript` mit Lockout-Schutz aus: sichert vorher den aktuellen
// Firewall-Zustand, startet auf dem Server einen unabhängigen
// Hintergrund-Timer, der die Änderung nach 30s automatisch zurückrollt,
// falls kein Bestätigungs-Signal ("Health-Check") eintrifft, und plant
// diese Bestätigung serverseitig ein. Läuft die Verbindung nach der
// Änderung ins Leere (SSH nicht mehr erreichbar), bleibt die
// Bestätigung aus und der Server stellt sich selbst wieder her.
export async function applyGuarded(
  server: ServerModel,
  backend: FirewallBackend,
  applyScript: string,
  onSettled: (confirmed: boolean) => void
): Promise<GuardedApplyResult> {
  if (backend === "none") {
    throw new Error("No supported firewall backend detected");
  }
  const token = genToken();
  const snapPath = `/tmp/.nm-fw-${token}.snap`;
  const okPath = `/tmp/.nm-fw-${token}.ok`;

  const script = `
set +e
${snapshotCommand(backend)} > "${snapPath}" 2>/dev/null
nohup bash -c '
  sleep ${Math.floor(ROLLBACK_TIMEOUT_MS / 1000)}
  if [ ! -f "${okPath}" ]; then
    ${restoreCommand(backend, snapPath)}
  fi
  rm -f "${snapPath}" "${okPath}"
' >/dev/null 2>&1 < /dev/null &
disown
${applyScript}
`.trim();

  const { command, stdin } = buildRootScriptCommand(server, script);
  const result = await execOnServer(server, command, 20_000, stdin);

  scheduleConfirm(server, token, onSettled);

  return {
    ...result,
    backend,
    token,
    rollbackTimeoutMs: ROLLBACK_TIMEOUT_MS,
  };
}

function scheduleConfirm(
  server: ServerModel,
  token: string,
  onSettled: (confirmed: boolean) => void
) {
  const okPath = `/tmp/.nm-fw-${token}.ok`;
  let settled = false;

  const attempt = async (delayMs: number, isLast: boolean) => {
    setTimeout(async () => {
      if (settled) return;
      try {
        const { command, stdin } = buildRootScriptCommand(
          server,
          `touch "${okPath}"`
        );
        await execOnServer(server, command, 10_000, stdin);
        settled = true;
        onSettled(true);
      } catch {
        if (isLast) {
          settled = true;
          onSettled(false);
        }
      }
    }, delayMs);
  };

  CONFIRM_ATTEMPTS_MS.forEach((delay, i) =>
    attempt(delay, i === CONFIRM_ATTEMPTS_MS.length - 1)
  );
}

export function buildSimpleAddScript(
  backend: FirewallBackend,
  id: string,
  input: SimpleRuleInput
): string {
  return buildAddRuleScript(backend, id, input);
}

export function buildSimpleDeleteScript(
  backend: FirewallBackend,
  id: string
): string {
  return buildDeleteRuleScript(backend, id);
}
